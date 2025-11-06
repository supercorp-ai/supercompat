import dayjs from 'dayjs'
import type OpenAI from 'openai'
import type { AIProjectClient } from '@azure/ai-projects'
import { uid } from 'radash'

export const azureAgentsRunAdapter = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}) => {
  const getOpenaiAssistant = async ({ assistantId }: { assistantId: string }) => {
    return { id: assistantId }
  }

  const handleRun = async ({
    threadId,
    assistantId,
    instructions,
    tools,
    onEvent,
  }: {
    threadId: string
    assistantId: string
    instructions?: string
    tools?: any[]
    onEvent: (event: OpenAI.Beta.AssistantStreamEvent) => Promise<any>
  }) => {
    try {
      // assistantId from OpenAI API maps to azureAgentId
      const azureAgentId = assistantId

      // Build the options object for Azure run creation
      const createOptions: any = {}
      if (instructions) {
        createOptions.instructions = instructions
      }
      if (tools) {
        createOptions.tools = tools
      }

      // Create the run
      let azureRun = await azureAiProject.agents.runs.create(
        threadId,
        azureAgentId,
        createOptions,
      )

      // Emit run created event
      await onEvent({
        event: 'thread.run.created',
        data: {
          id: azureRun.id,
          object: 'thread.run',
          created_at: dayjs(azureRun.createdAt).unix(),
          thread_id: azureRun.threadId,
          assistant_id: assistantId,
          status: azureRun.status as any,
          required_action: null,
          last_error: null,
          expires_at: null,
          started_at: null,
          cancelled_at: null,
          failed_at: null,
          completed_at: null,
          incomplete_details: null,
          model: '',
          instructions: '',
          tools: [],
          metadata: {},
          temperature: null,
          top_p: null,
          max_prompt_tokens: null,
          max_completion_tokens: null,
          truncation_strategy: {
            type: 'auto',
            last_messages: null,
          },
          response_format: 'auto',
          tool_choice: 'auto',
          parallel_tool_calls: true,
          usage: null,
        } as OpenAI.Beta.Threads.Run,
      })

      // Emit run in progress event
      await onEvent({
        event: 'thread.run.in_progress',
        data: {
          id: azureRun.id,
          object: 'thread.run',
          created_at: dayjs(azureRun.createdAt).unix(),
          thread_id: azureRun.threadId,
          assistant_id: assistantId,
          status: 'in_progress',
          required_action: null,
          last_error: null,
          expires_at: null,
          started_at: dayjs(azureRun.createdAt).unix(),
          cancelled_at: null,
          failed_at: null,
          completed_at: null,
          incomplete_details: null,
          model: '',
          instructions: '',
          tools: [],
          metadata: {},
          temperature: null,
          top_p: null,
          max_prompt_tokens: null,
          max_completion_tokens: null,
          truncation_strategy: {
            type: 'auto',
            last_messages: null,
          },
          response_format: 'auto',
          tool_choice: 'auto',
          parallel_tool_calls: true,
          usage: null,
        } as OpenAI.Beta.Threads.Run,
      })

      // Poll until the run reaches a terminal status
      while (azureRun.status === 'queued' || azureRun.status === 'in_progress') {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        azureRun = await azureAiProject.agents.runs.get(threadId, azureRun.id)
      }

      // Handle different terminal statuses
      if (azureRun.status === 'failed') {
        await onEvent({
          event: 'thread.run.failed',
          data: {
            id: azureRun.id,
            object: 'thread.run',
            created_at: dayjs(azureRun.createdAt).unix(),
            thread_id: azureRun.threadId,
            assistant_id: assistantId,
            status: 'failed',
            required_action: null,
            last_error: azureRun.lastError
              ? {
                  code: 'server_error',
                  message: JSON.stringify(azureRun.lastError),
                }
              : null,
            expires_at: null,
            started_at: dayjs(azureRun.createdAt).unix(),
            cancelled_at: null,
            failed_at: dayjs().unix(),
            completed_at: null,
            incomplete_details: null,
            model: '',
            instructions: '',
            tools: [],
            metadata: {},
            temperature: null,
            top_p: null,
            max_prompt_tokens: null,
            max_completion_tokens: null,
            truncation_strategy: {
              type: 'auto',
              last_messages: null,
            },
            response_format: 'auto',
            tool_choice: 'auto',
            parallel_tool_calls: true,
            usage: null,
          } as OpenAI.Beta.Threads.Run,
        })
        return
      }

      if (azureRun.status === 'requires_action') {
        // Handle tool calls
        const requiredAction = azureRun.requiredAction
        if (requiredAction?.type === 'submit_tool_outputs') {
          const toolCalls = (requiredAction as any).submitToolOutputs.toolCalls.map((tc: any) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          }))

          await onEvent({
            event: 'thread.run.requires_action',
            data: {
              id: azureRun.id,
              object: 'thread.run',
              created_at: dayjs(azureRun.createdAt).unix(),
              thread_id: azureRun.threadId,
              assistant_id: assistantId,
              status: 'requires_action',
              required_action: {
                type: 'submit_tool_outputs',
                submit_tool_outputs: {
                  tool_calls: toolCalls,
                },
              },
              last_error: null,
              expires_at: null,
              started_at: dayjs(azureRun.createdAt).unix(),
              cancelled_at: null,
              failed_at: null,
              completed_at: null,
              incomplete_details: null,
              model: '',
              instructions: '',
              tools: [],
              metadata: {},
              temperature: null,
              top_p: null,
              max_prompt_tokens: null,
              max_completion_tokens: null,
              truncation_strategy: {
                type: 'auto',
                last_messages: null,
              },
              response_format: 'auto',
              tool_choice: 'auto',
              parallel_tool_calls: true,
              usage: null,
            } as OpenAI.Beta.Threads.Run,
          })
          return
        }
      }

      if (azureRun.status === 'completed') {
        // Retrieve messages and emit message events
        // Only emit messages from THIS run by filtering by creation time after run started
        const runStartTime = dayjs(azureRun.createdAt)
        const messages = await azureAiProject.agents.messages.list(threadId, {
          order: 'asc',
        })

        for await (const message of messages) {
          // Only emit assistant messages that were created during or after this run
          const messageTime = dayjs(message.createdAt)
          if (
            message.role === 'assistant' &&
            (messageTime.isAfter(runStartTime) || messageTime.isSame(runStartTime))
          ) {
            // Find text content
            const textContent = message.content.find((c: any) => c.type === 'text')
            if (textContent && 'text' in textContent) {
              await onEvent({
                event: 'thread.message.created',
                data: {
                  id: message.id,
                  object: 'thread.message',
                  created_at: dayjs(message.createdAt).unix(),
                  thread_id: message.threadId,
                  role: 'assistant',
                  content: [
                    {
                      type: 'text',
                      text: {
                        value: textContent.text.value,
                        annotations: [],
                      },
                    },
                  ],
                  assistant_id: assistantId,
                  run_id: azureRun.id,
                  attachments: [],
                  metadata: {},
                  status: 'in_progress',
                  completed_at: null,
                  incomplete_at: null,
                  incomplete_details: null,
                } as OpenAI.Beta.Threads.Message,
              })

              await onEvent({
                event: 'thread.message.completed',
                data: {
                  id: message.id,
                  object: 'thread.message',
                  created_at: dayjs(message.createdAt).unix(),
                  thread_id: message.threadId,
                  role: 'assistant',
                  content: [
                    {
                      type: 'text',
                      text: {
                        value: textContent.text.value,
                        annotations: [],
                      },
                    },
                  ],
                  assistant_id: assistantId,
                  run_id: azureRun.id,
                  attachments: [],
                  metadata: {},
                  status: 'completed',
                  completed_at: dayjs().unix(),
                  incomplete_at: null,
                  incomplete_details: null,
                } as OpenAI.Beta.Threads.Message,
              })
            }
          }
        }

        await onEvent({
          event: 'thread.run.completed',
          data: {
            id: azureRun.id,
            object: 'thread.run',
            created_at: dayjs(azureRun.createdAt).unix(),
            thread_id: azureRun.threadId,
            assistant_id: assistantId,
            status: 'completed',
            required_action: null,
            last_error: null,
            expires_at: null,
            started_at: dayjs(azureRun.createdAt).unix(),
            cancelled_at: null,
            failed_at: null,
            completed_at: dayjs().unix(),
            incomplete_details: null,
            model: '',
            instructions: '',
            tools: [],
            metadata: {},
            temperature: null,
            top_p: null,
            max_prompt_tokens: null,
            max_completion_tokens: null,
            truncation_strategy: {
              type: 'auto',
              last_messages: null,
            },
            response_format: 'auto',
            tool_choice: 'auto',
            parallel_tool_calls: true,
            usage: null,
          } as OpenAI.Beta.Threads.Run,
        })
      }
    } catch (e: any) {
      // Generate a unique run ID for the failed run
      const errorRunId = `run_${uid(18)}`
      await onEvent({
        event: 'thread.run.failed',
        data: {
          id: errorRunId,
          object: 'thread.run',
          created_at: dayjs().unix(),
          thread_id: threadId,
          assistant_id: assistantId,
          status: 'failed',
          required_action: null,
          last_error: {
            code: 'server_error',
            message: String(e?.message || e || 'Unknown error'),
          },
          expires_at: null,
          started_at: dayjs().unix(),
          cancelled_at: null,
          failed_at: dayjs().unix(),
          completed_at: null,
          incomplete_details: null,
          model: '',
          instructions: '',
          tools: [],
          metadata: {},
          temperature: null,
          top_p: null,
          max_prompt_tokens: null,
          max_completion_tokens: null,
          truncation_strategy: {
            type: 'auto',
            last_messages: null,
          },
          response_format: 'auto',
          tool_choice: 'auto',
          parallel_tool_calls: true,
          usage: null,
        } as OpenAI.Beta.Threads.Run,
      })
    }
  }

  return {
    handleRun,
    getOpenaiAssistant,
  }
}
