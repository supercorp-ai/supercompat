import OpenAI from 'openai'
import type Groq from 'groq-sdk'

export const groqClientAdapter = ({
  groq,
}: {
  groq: Groq
}) => ({
  'https://api.openai.com/v1/chat/completions': {
    // @ts-ignore-next-line
    post: async (_url: string, options: any): ReturnType<OpenAI.Completions['create']> => {
      const body = JSON.parse(options.body)
      console.log({ body })

      if (body.stream) {
        // @ts-ignore-next-line
        return groq.messages.stream(resultFirstArg, secondArg, ...restArgs)
      } else {
        try {
          const data = await groq.chat.completions.create(body)

          // @ts-ignore-next-line
          return new Response(JSON.stringify({
            data,
          }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          })
        } catch (error) {
          console.dir({ error }, { depth: null })
          // @ts-ignore-next-line
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
    },
  },
})
