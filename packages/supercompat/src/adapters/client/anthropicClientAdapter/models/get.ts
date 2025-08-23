import type Anthropic from '@anthropic-ai/sdk'

export const get = ({
  anthropic,
}: {
  anthropic: Anthropic
}) => async (_url: string, _options: RequestInit) => {
  try {
    const response = await anthropic.models.list()

    return new Response(JSON.stringify({
      type: 'list',
      data: response.data.map((model) => ({
        id: model.id,
        object: 'model',
      })),
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  } catch (error: unknown) {
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
