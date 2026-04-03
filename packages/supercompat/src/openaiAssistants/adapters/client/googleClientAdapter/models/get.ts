import type { GoogleGenAI } from '@google/genai'

export const get = ({
  google,
}: {
  google: GoogleGenAI
}) => async (_url: string, _options: any) => {
  try {
    const pager = await google.models.list()

    return new Response(JSON.stringify({
      type: 'list',
      data: pager.page.map((model) => ({
        id: model.name ?? '',
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
