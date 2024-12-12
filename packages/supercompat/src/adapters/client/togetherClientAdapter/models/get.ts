import type OpenAI from 'openai'

export const get = ({
  together,
}: {
  together: OpenAI
}) => async (_url: string, _options: any) => {
  try {
    const data = await together.models.list()

    return new Response(JSON.stringify({
      type: 'list',
      // @ts-ignore-next-line
      data: data.body,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    return new Response(JSON.stringify({
      error,
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
}
