import type OpenAI from 'openai'

const models = [
  'Humiris/humiris-moai',
]

export const get = ({
  humiris,
}: {
  humiris: OpenAI
}) => async (_url: string, _options: any) => {
  try {
    return new Response(JSON.stringify({
      type: 'list',
      data: models.map((model) => ({
        id: model,
        object: 'model',
      })),
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
