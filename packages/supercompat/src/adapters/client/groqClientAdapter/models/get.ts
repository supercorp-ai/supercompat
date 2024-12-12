import type Groq from 'groq-sdk'

export const get = ({
  groq,
}: {
  groq: Groq
}) => async (_url: string, _options: any) => {
  try {
    const data = await groq.models.list()

    return new Response(JSON.stringify(data), {
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
