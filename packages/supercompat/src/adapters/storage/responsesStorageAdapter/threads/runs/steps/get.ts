import type { OpenAI } from 'openai'
import pMap from 'p-map'
import { last } from 'radash'
import type { RunAdapter } from '@/types'
import { stepsRegexp } from '@/lib/steps/stepsRegexp'
import { serializeItemAsRunStep } from '@/lib/items/serializeItemAsRunStep'
import { serializeItemAsImageGenerationRunStep } from '@/lib/items/serializeItemAsImageGenerationRunStep'
import { serializeItemAsWebSearchRunStep } from '@/lib/items/serializeItemAsWebSearchRunStep'
import { serializeItemAsMcpListToolsRunStep } from '@/lib/items/serializeItemAsMcpListToolsRunStep'
import { serializeItemAsMcpCallRunStep } from '@/lib/items/serializeItemAsMcpCallRunStep'
import { serializeItemAsCodeInterpreterCallRunStep } from '@/lib/items/serializeItemAsCodeInterpreterCallRunStep'

export const get = ({
  client,
  runAdapter,
}: {
  client: OpenAI
  runAdapter: RunAdapter
}) => async (urlString: string) => {
  const url = new URL(urlString)

  const [, threadId, runId] = url.pathname.match(new RegExp(stepsRegexp))!

  // const {
  //   limit,
  //   order,
  //   after,
  // } = assign({
  //   limit: '20',
  //   order: 'desc',
  //   // after: null,
  // }, Object.fromEntries(url.searchParams))

  const response = await client.responses.retrieve(runId)

  const functionCalls = response.output.filter((item) => (
    item.type === 'function_call'
  ))

  const functionCallOutputsResponses = await pMap(functionCalls, async (functionCall) => {
    const items = await client.conversations.items.list(threadId, {
      after: functionCall.id,
      order: 'asc',
    })

    return items.data.find((item) => (
      item.type === 'function_call_output' && item.call_id === (functionCall as OpenAI.Responses.ResponseFunctionToolCall).call_id
    ))
  })

  const functionCallOutputs = functionCallOutputsResponses.filter(Boolean) as OpenAI.Conversations.ConversationItem[]

  const openaiAssistant = await runAdapter.getOpenaiAssistant()

  const data = response.output.flatMap((item) => {
    const step = serializeItemAsRunStep({
      item,
      items: functionCallOutputs,
      threadId,
      openaiAssistant,
      runId: response.id,
    });

    if (item.type === 'function_call') {
      const synthCreation = {
        id: `mc${item.id}`,
        run_id: response.id,
        status: 'completed',
        completed_at: step.created_at,
        step_details: {
          type: 'message_creation',
          message_creation: { message_id: item.id },
        },
      };
      return [synthCreation, step];
    } else if (item.type === 'image_generation_call') {
      return [
        serializeItemAsImageGenerationRunStep({
          item,
          openaiAssistant,
          threadId,
          runId: response.id,
        }),
        step,
      ]
    } else if (item.type === 'web_search_call') {
      return [
        serializeItemAsWebSearchRunStep({
          item,
          openaiAssistant,
          threadId,
          runId: response.id,
        }),
        step,
      ]
    } else if (item.type === 'mcp_list_tools') {
      return [
        serializeItemAsMcpListToolsRunStep({
          item,
          openaiAssistant,
          threadId,
          runId: response.id,
        }),
        step,
      ]
    } else if (item.type === 'mcp_call') {
      return [
        serializeItemAsMcpCallRunStep({
          item,
          openaiAssistant,
          threadId,
          runId: response.id,
        }),
        step,
      ]
    } else if (item.type === 'code_interpreter_call') {
      return [
        serializeItemAsCodeInterpreterCallRunStep({
          item,
          openaiAssistant,
          threadId,
          runId: response.id,
        }),
        step,
      ]
    }

    return [step];
  })

  return new Response(JSON.stringify({
    data,
    has_more: false,
    last_id: last(response.output)?.id ?? null,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
