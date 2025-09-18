import type OpenAI from 'openai'

type MessageCreateResponse = Response & {
  json: () => Promise<ReturnType<OpenAI.Beta.Threads.Messages['create']>>
}

export const get = () => async (urlString: string): Promise<MessageCreateResponse> => {
  return new Response(JSON.stringify({
    data: [],
    has_more: false,
    last_id: null,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
