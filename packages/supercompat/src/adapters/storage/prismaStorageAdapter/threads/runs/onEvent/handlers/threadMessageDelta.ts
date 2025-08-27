import type OpenAI from 'openai'

export const threadMessageDelta = ({
  event,
  controller,
}: {
  event: OpenAI.Beta.AssistantStreamEvent.ThreadMessageDelta
  controller: ReadableStreamDefaultController<string>
}) => (
  controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
)
