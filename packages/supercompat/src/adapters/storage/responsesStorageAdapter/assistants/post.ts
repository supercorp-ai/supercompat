import type { OpenAI } from 'openai'

export const post = ({
  openaiAssistant: _openaiAssistant,
}: {
  openaiAssistant: OpenAI.Beta.Assistants.Assistant
}) =>
  async () => (
    new Response(
      JSON.stringify({
        error: {
          message: 'Assistant creation is not implemented for the Responses storage adapter.',
          type: 'not_implemented',
        },
      }),
      {
        status: 501,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )
  )
