import type { OpenAI } from 'openai'
import { last } from 'radash'
import type { RunAdapter } from '@/types'
import { stepsRegexp } from '@/lib/steps/stepsRegexp'
import { serializeItemAsMessageCreationRunStep } from '@/lib/items/serializeItemAsMessageCreationRunStep'
import { serializeItemAsFunctionCallRunStep } from '@/lib/items/serializeItemAsFunctionCallRunStep'
import { serializeItemAsImageGenerationRunStep } from '@/lib/items/serializeItemAsImageGenerationRunStep'
import { serializeItemAsWebSearchRunStep } from '@/lib/items/serializeItemAsWebSearchRunStep'
import { serializeItemAsMcpListToolsRunStep } from '@/lib/items/serializeItemAsMcpListToolsRunStep'
import { serializeItemAsMcpCallRunStep } from '@/lib/items/serializeItemAsMcpCallRunStep'
import { serializeItemAsCodeInterpreterCallRunStep } from '@/lib/items/serializeItemAsCodeInterpreterCallRunStep'
import { serializeItemAsComputerCallRunStep } from '@/lib/items/serializeItemAsComputerCallRunStep'

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

  const latestToolCallItem = response.output.findLast((item) => (
    item.type === 'function_call'
    // item.type === 'computer_call'
  ))

  let functionCallOutputItems: OpenAI.Responses.ResponseFunctionToolCallOutputItem[] = []
  let computerCallOutputItems: OpenAI.Responses.ResponseComputerToolCallOutputItem[] = []

  if (latestToolCallItem) {
    const items = await client.conversations.items.list(threadId, {
      after: latestToolCallItem.id,
      order: 'asc',
      limit: 20,
    })

    functionCallOutputItems = items.data.filter((item) => item.type === 'function_call_output') as OpenAI.Responses.ResponseFunctionToolCallOutputItem[]
    computerCallOutputItems = items.data.filter((item) => item.type === 'computer_call_output') as OpenAI.Responses.ResponseComputerToolCallOutputItem[]
  }

  const openaiAssistant = await runAdapter.getOpenaiAssistant({ select: { id: true } })

  const data = response.output.flatMap((item) => {
    const step = serializeItemAsMessageCreationRunStep({
      item,
      threadId,
      openaiAssistant,
      runId: response.id,
    });

    if (item.type === 'function_call') {
      return [
        serializeItemAsFunctionCallRunStep({
          item,
          items: functionCallOutputItems,
          openaiAssistant,
          threadId,
          runId: response.id,
        }),
        step,
      ]
    } else if (item.type === 'computer_call') {
      return [
        serializeItemAsComputerCallRunStep({
          item,
          items: computerCallOutputItems,
          openaiAssistant,
          threadId,
          runId: response.id,
        }),
        step,
      ]
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
