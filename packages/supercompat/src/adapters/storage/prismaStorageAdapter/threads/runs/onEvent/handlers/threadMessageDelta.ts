import type OpenAI from 'openai'

export const threadMessageDelta = ({
  event,
  controller,
}: {
  event: OpenAI.Beta.AssistantStreamEvent.ThreadMessageDelta
  controller: ReadableStreamDefaultController<OpenAI.Beta.AssistantStreamEvent.ThreadMessageDelta>
}) => (
  controller.enqueue(event)
)
