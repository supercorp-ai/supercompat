import type OpenAI from 'openai'
import { responseRegexp } from '@/lib/responses/responseRegexp'

type ResponseGetResponse = Response & {
  json: () => Promise<OpenAI.Responses.Response>
}

export const get = ({
  client,
}: {
  client: OpenAI
}) => async (urlString: string): Promise<ResponseGetResponse> => {
  const url = new URL(urlString)
  const [, responseId] = url.pathname.match(new RegExp(responseRegexp))!

  // Call the Azure OpenAI client's responses.retrieve()
  // This client is obtained via AIProjectClient.getOpenAIClient()
  const response = await client.responses.retrieve(responseId)

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
