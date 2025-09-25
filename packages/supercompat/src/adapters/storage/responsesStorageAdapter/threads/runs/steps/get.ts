import type { OpenAI } from 'openai'
import pMap from 'p-map'
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

  const functionCalls = response.output.filter((item) => item.type === 'function_call')
  const computerCalls = response.output.filter((item) => item.type === 'computer_call')

  const functionCallOutputsResponsesPromise = pMap(functionCalls, async (functionCall) => {
    const items = await client.conversations.items.list(threadId, {
      after: functionCall.id,
      order: 'asc',
    })

    return items.data.find((item) => (
      item.type === 'function_call_output' &&
      item.call_id === (functionCall as OpenAI.Responses.ResponseFunctionToolCall).call_id
    ))
  })

  const computerCallOutputsResponsesPromise = pMap(computerCalls, async (computerCall) => {
    const items = await client.conversations.items.list(threadId, {
      after: computerCall.id,
      order: 'asc',
    })

    return items.data.find((item) => (
      item.type === 'computer_call_output' &&
      item.call_id === (computerCall as OpenAI.Responses.ResponseComputerToolCall).call_id
    ))
  })

  const [functionCallOutputsResponses, computerCallOutputsResponses] = await Promise.all([
    functionCallOutputsResponsesPromise,
    computerCallOutputsResponsesPromise,
  ])

  const functionCallOutputs = functionCallOutputsResponses.filter(Boolean) as OpenAI.Responses.ResponseFunctionToolCallOutputItem[]
  const computerCallOutputs = computerCallOutputsResponses.filter(Boolean) as OpenAI.Responses.ResponseComputerToolCallOutputItem[]

  const openaiAssistant = await runAdapter.getOpenaiAssistant()

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
          items: functionCallOutputs,
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
          items: computerCallOutputs,
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
