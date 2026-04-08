import type { OpenRouter } from '@openrouter/sdk'

export const get = ({
  openRouter,
}: {
  openRouter: OpenRouter
}) => async (_url: string, _options: any) => {
  try {
    const data = await openRouter.models.list()

    const openaiModels = {
      object: 'list',
      data: data.data.map((m: any) => ({
        id: m.id,
        object: 'model',
        created: m.created,
        owned_by: m.id.split('/')[0] || 'openrouter',
      })),
    }

    return new Response(JSON.stringify(openaiModels), {
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
