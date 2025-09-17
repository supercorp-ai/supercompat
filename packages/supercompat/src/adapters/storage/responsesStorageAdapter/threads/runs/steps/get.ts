import type { OpenAI } from 'openai'
import pMap from 'p-map'
import { last } from 'radash'
import { stepsRegexp } from '@/lib/steps/stepsRegexp'
import { serializeItemAsRunStep } from '@/lib/items/serializeItemAsRunStep'
import dayjs from 'dayjs'

export const get = ({
  openai,
  openaiAssistant,
}: {
  openai: OpenAI
  openaiAssistant: OpenAI.Beta.Assistants.Assistant
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

  const response = await openai.responses.retrieve(runId)

  const functionCalls = response.output.filter((item) => (
    item.type === 'function_call'
  ))

  const functionCallOutputsResponses = await pMap(functionCalls, async (functionCall) => {
    const items = await openai.conversations.items.list(threadId, {
      after: functionCall.id,
      order: 'asc',
    })

    return items.data.find((item) => (
      item.type === 'function_call_output' && item.call_id === (functionCall as OpenAI.Responses.ResponseFunctionToolCall).call_id
    ))
  })

  const functionCallOutputs = functionCallOutputsResponses.filter(Boolean) as OpenAI.Conversations.ConversationItem[]
  const nonFcItems = response.output.filter((item) => (
    item.type !== 'function_call'
  ))

  console.dir({ output: response.output, nonFcItems }, { depth: null })

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
