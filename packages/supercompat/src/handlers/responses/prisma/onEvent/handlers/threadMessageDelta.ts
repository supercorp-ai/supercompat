import type OpenAI from 'openai'

export const threadMessageDelta = ({
  event,
  controller,
  outputItemId,
}: {
  event: OpenAI.Beta.AssistantStreamEvent.ThreadMessageDelta
  controller: ReadableStreamDefaultController
  outputItemId: string
}) => {
  const textDelta = event.data.delta?.content?.[0]
  if (!textDelta || textDelta.type !== 'text') return

  controller.enqueue({
    type: 'response.output_text.delta',
    item_id: outputItemId,
    output_index: 0,
    content_index: 0,
    delta: textDelta.text?.value ?? '',
  })
}
