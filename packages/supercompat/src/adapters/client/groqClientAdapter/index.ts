import OpenAI from 'openai'
import type Groq from 'groq-sdk'

export const groqClientAdapter = ({
  groq,
}: {
  groq: Groq
}) => ({
  'https://api.openai.com/v1/chat/completions': {
    // @ts-ignore-next-line
    post: async (...args: Parameters<OpenAI.Completions['create']>): ReturnType<OpenAI.Completions['create']> => {
      // const [firstArg, secondArg, ...restArgs] = args

      // @ts-ignore-next-line
      const parsedSecondArg = JSON.parse(args[1].body)
      // console.dir({ messages }, { depth: null })
      //
      // const resultFirstArg = {
      //   ...firstArg,
      //   messages,
      // }

      if (args[0].stream) {
        // @ts-ignore-next-line
        return groq.messages.stream(resultFirstArg, secondArg, ...restArgs)
      } else {
        // console.log('not stream', {
        //   resultFirstArg,
        // })
        try {
          const data = await groq.chat.completions.create(parsedSecondArg)

          // console.dir({ data }, { depth: null })
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
