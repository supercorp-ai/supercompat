import type Anthropic from '@anthropic-ai/sdk'

const models = [
  'claude-3-7-sonnet-latest',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-haiku-latest',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet-20240620',
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'claude-3-5-haiku-20241022',
  'claude-3-haiku-20240307',
]

export const get = ({
  anthropic,
}: {
  anthropic: Anthropic
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
