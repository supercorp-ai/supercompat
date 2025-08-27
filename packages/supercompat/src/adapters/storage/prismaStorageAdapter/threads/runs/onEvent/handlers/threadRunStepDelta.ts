import type OpenAI from 'openai'

export const threadRunStepDelta = ({
  event,
  controller,
}: {
  event: OpenAI.Beta.AssistantStreamEvent.ThreadRunStepDelta
  controller: ReadableStreamDefaultController<string>
}) => (
  controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
)
