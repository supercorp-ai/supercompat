/**
 * Azure Agents run adapter for the Responses API surface.
 *
 * Creates an Azure Agent with the requested tools, runs it, and translates
 * Azure Agent streaming events → Responses API events.
 *
 * Supports: file_search, code_interpreter, function tools.
 */
import type { AIProjectClient } from '@azure/ai-projects'
import { uid } from 'radash'
import dayjs from 'dayjs'

export type ResponsesRunEvent = {
  type: string
  [key: string]: any
}

type HandleArgs = {
  requestBody: any
  onEvent: (event: ResponsesRunEvent) => Promise<void>
  // Optional context from storage — reuse existing agent/thread instead of creating new ones
  agentId?: string
  threadId?: string
}

export const azureAgentsResponsesRunAdapter = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}) => ({
  type: 'responses-azure-agents' as const,

  handleRun: async ({
    requestBody,
    onEvent,
    agentId: existingAgentId,
    threadId: existingThreadId,
  }: HandleArgs) => {
    const responseId = `resp_${uid(24)}`
    let createdAgent = false

    // Create a temporary agent with the requested tools
    const tools = (requestBody.tools || []).map((tool: any) => {
      if (tool.type === 'function') {
        return {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description || '',
            parameters: tool.parameters || {},
          },
        }
      }
      if (tool.type === 'file_search') {
        return { type: 'file_search' }
      }
      if (tool.type === 'code_interpreter') {
        return { type: 'code_interpreter' }
      }
      return tool
    })

    // Collect vector_store_ids from file_search tools
    const vectorStoreIds = (requestBody.tools || [])
      .filter((t: any) => t.type === 'file_search' && t.vector_store_ids?.length)
      .flatMap((t: any) => t.vector_store_ids)

    let agentId = existingAgentId
    if (!agentId) {
      const agent = await azureAiProject.agents.createAgent(requestBody.model, {
        name: `temp_${uid(8)}`,
        instructions: requestBody.instructions || '',
        tools,
        ...(vectorStoreIds.length > 0 ? {
          toolResources: {
            fileSearch: { vectorStoreIds },
          },
        } : {}),
      })
      agentId = agent.id
      createdAgent = true
    }

    // Create or reuse thread
    let threadId = existingThreadId
    if (!threadId) {
      const thread = await azureAiProject.agents.threads.create()
      threadId = thread.id
    }

    // Separate input items by type
    const input = requestBody.input
    const toolOutputItems: any[] = []
    const messageItems: any[] = []

    if (typeof input === 'string') {
      messageItems.push({ type: 'message', role: 'user', content: input })
    } else if (Array.isArray(input)) {
      for (const item of input) {
        if (item.type === 'function_call_output') {
          toolOutputItems.push(item)
        } else if (item.type === 'message' || item.role) {
          messageItems.push(item)
        }
      }
    }

    // Add messages to thread
    for (const item of messageItems) {
      const content = typeof item.content === 'string' ? item.content
        : Array.isArray(item.content) ? item.content.map((c: any) => c.text || c).join('')
        : String(item.content)
      await azureAiProject.agents.messages.create(threadId!, item.role || 'user', content)
    }

    // Emit response.created
    await onEvent({
      type: 'response.created',
      response: {
        id: responseId,
        object: 'response',
        status: 'in_progress',
        model: requestBody.model,
        output: [],
        created_at: dayjs().unix(),
      },
    })

    await onEvent({
      type: 'response.in_progress',
      response: { id: responseId, status: 'in_progress' },
    })

    let current: any

    if (toolOutputItems.length > 0) {
      // Tool output submission — find the pending run and submit outputs
      const runs: any[] = []
      for await (const r of azureAiProject.agents.runs.list(threadId!)) {
        runs.push(r)
      }
      const pendingRun = runs.find((r: any) => r.status === 'requires_action')

      if (pendingRun) {
        const toolOutputs = toolOutputItems.map((item: any) => ({
          toolCallId: item.call_id,
          output: typeof item.output === 'string' ? item.output : JSON.stringify(item.output),
        }))
        await azureAiProject.agents.runs.submitToolOutputs(threadId!, pendingRun.id, toolOutputs)

        current = pendingRun
        while (current.status === 'queued' || current.status === 'in_progress' || current.status === 'requires_action') {
          await new Promise(r => setTimeout(r, 500))
          current = await azureAiProject.agents.runs.get(threadId!, pendingRun.id)
        }
      } else {
        // No pending run — create a new one with tool outputs as a user message
        await azureAiProject.agents.messages.create(threadId!, 'user',
          toolOutputItems.map((item: any) => `Tool result for ${item.call_id}: ${typeof item.output === 'string' ? item.output : JSON.stringify(item.output)}`).join('\n')
        )
        const run = await azureAiProject.agents.runs.create(threadId!, agentId!)
        current = run
        while (current.status === 'queued' || current.status === 'in_progress') {
          await new Promise(r => setTimeout(r, 500))
          current = await azureAiProject.agents.runs.get(threadId!, run.id)
        }
      }
    } else {
      // Normal run — create and poll
      const run = await azureAiProject.agents.runs.create(threadId!, agentId!)
      current = run
      while (current.status === 'queued' || current.status === 'in_progress') {
        await new Promise(r => setTimeout(r, 500))
        current = await azureAiProject.agents.runs.get(threadId!, run.id)
      }
    }

    // Collect output
    const output: any[] = []

    if (current.status === 'completed') {
      // Get messages
      const messages: any[] = []
      for await (const m of azureAiProject.agents.messages.list(threadId!)) {
        messages.push(m)
      }

      const assistantMsg = messages.find(m => m.role === 'assistant')
      if (assistantMsg) {
        const text = assistantMsg.content
          ?.filter((c: any) => c.type === 'text')
          .map((c: any) => c.text?.value || '')
          .join('') || ''

        const messageItem = {
          id: `msg_${uid(24)}`,
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text, annotations: [] }],
        }
        output.push(messageItem)

        await onEvent({
          type: 'response.output_item.added',
          output_index: 0,
          item: messageItem,
        })

        // Emit text as a single delta
        if (text) {
          await onEvent({
            type: 'response.output_text.delta',
            output_index: 0,
            content_index: 0,
            delta: text,
          })

          await onEvent({
            type: 'response.output_text.done',
            output_index: 0,
            content_index: 0,
            text,
          })
        }

        await onEvent({
          type: 'response.output_item.done',
          output_index: 0,
          item: messageItem,
        })
      }
    } else if (current.status === 'requires_action') {
      // Tool calls
      const toolCalls = (current.requiredAction as any)?.submitToolOutputs?.toolCalls || []
      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i] as any
        const functionCallItem = {
          id: `fc_${uid(24)}`,
          type: 'function_call',
          call_id: tc.id,
          name: tc.function?.name || '',
          arguments: tc.function?.arguments || '',
          status: 'completed',
        }
        output.push(functionCallItem)

        await onEvent({
          type: 'response.output_item.added',
          output_index: i,
          item: functionCallItem,
        })
        await onEvent({
          type: 'response.function_call_arguments.done',
          output_index: i,
          call_id: tc.id,
          name: tc.function?.name || '',
          arguments: tc.function?.arguments || '',
        })
        await onEvent({
          type: 'response.output_item.done',
          output_index: i,
          item: functionCallItem,
        })
      }
    }

    // Get usage
    const usage = current.usage ? {
      input_tokens: (current.usage as any).promptTokens ?? 0,
      output_tokens: (current.usage as any).completionTokens ?? 0,
      total_tokens: (current.usage as any).totalTokens ?? 0,
    } : undefined

    // Emit completed
    await onEvent({
      type: 'response.completed',
      response: {
        id: responseId,
        object: 'response',
        status: current.status === 'requires_action' ? 'completed' : current.status,
        model: requestBody.model,
        output,
        usage,
        created_at: dayjs().unix(),
      },
    })

    // Cleanup agent
    try { createdAgent && await azureAiProject.agents.deleteAgent(agentId!) } catch {}
  },

})
