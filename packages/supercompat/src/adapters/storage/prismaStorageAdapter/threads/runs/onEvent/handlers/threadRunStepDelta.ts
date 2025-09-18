import type OpenAI from 'openai'

export const threadRunStepDelta = ({
  event,
  controller,
}: {
  event: OpenAI.Beta.AssistantStreamEvent.ThreadRunStepDelta
  controller: ReadableStreamDefaultController<OpenAI.Beta.AssistantStreamEvent.ThreadRunStepDelta>
}) => (
  controller.enqueue(event)
)
