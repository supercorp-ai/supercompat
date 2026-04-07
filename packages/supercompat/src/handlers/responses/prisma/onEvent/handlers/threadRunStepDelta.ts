import type OpenAI from 'openai'

export const threadRunStepDelta = ({
  event,
  controller,
  functionCallItems,
}: {
  event: OpenAI.Beta.AssistantStreamEvent.ThreadRunStepDelta
  controller: ReadableStreamDefaultController
  functionCallItems: Map<number, string>
}) => {
  const toolCalls = (event.data.delta as any)?.step_details?.tool_calls
  if (!toolCalls) return

  for (const tc of toolCalls) {
    if (tc.type !== 'function' && tc.function === undefined) continue

    const index = tc.index ?? 0
    const itemId = functionCallItems.get(index)
    if (!itemId) continue

    const argsDelta = tc.function?.arguments ?? ''

    if (argsDelta) {
      controller.enqueue({
        type: 'response.function_call_arguments.delta',
        item_id: itemId,
        output_index: index,
        delta: argsDelta,
      })
    }
  }
}
