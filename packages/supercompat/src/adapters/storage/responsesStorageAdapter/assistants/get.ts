import type { OpenAI } from 'openai'

type MessageCreateResponse = Response & {
  json: () => Promise<ReturnType<OpenAI.Beta.Threads.Messages['create']>>
}

export const get = ({
  openaiAssistant,
}: {
  openaiAssistant: OpenAI.Beta.Assistants.Assistant
}) => async (urlString: string): Promise<MessageCreateResponse> => {
  return new Response(JSON.stringify({
    data: [openaiAssistant],
    has_more: false,
    last_id: openaiAssistant.id,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
