import type OpenAI from 'openai'

const models = [
  'gemini-2.5-pro-preview-03-25',
  'gemini-2.5-pro-exp-03-25',
  'gemini-2.0-flash-exp',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite-preview-02-05',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
  'gemma-3-27b-it',
  'gemma-3-12b-it',
  'gemma-3-4b-it',
  'text-embedding-004',
  'aqa',
]

export const get = ({
  google,
}: {
  google: OpenAI
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
