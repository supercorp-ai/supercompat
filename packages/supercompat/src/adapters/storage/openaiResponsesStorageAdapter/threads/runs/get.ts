import OpenAI from 'openai'

export const get = ({ openai }: { openai: OpenAI }) => async (
  _urlString: string,
): Promise<Response> => {
  return new Response(
    JSON.stringify({ object: 'list', data: [], has_more: false }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}
