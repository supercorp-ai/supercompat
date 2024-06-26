import OpenAI from 'openai'
import { APIPromise } from 'openai/core'
import type { Stream } from 'openai/streaming'
import type Groq from 'groq-sdk'
import { PassThrough, Readable } from 'stream'

type CreateResponse = Response & {
  json: () => Promise<ReturnType<OpenAI.Beta.Threads.Runs['create']>>
}

// @ts-ignore-next-line
async function* createAsyncIterator(stream) {
    for await (const chunk of stream) {
        yield chunk;
    }
}

// @ts-ignore-next-line
function streamToReadable(stream) {
  const asyncIterator = createAsyncIterator(stream);

  return new Readable({
    async read() {
      try {
        const { value, done } = await asyncIterator.next();

        console.log({ value })
        if (done) {
          this.push(null); // Signal the end of the stream
        } else {
          this.push(Buffer.from(JSON.stringify(value)))
        }
      } catch (err) {
        // @ts-ignore-next-line
        this.destroy(err); // Handle any errors
      }
    }
  });
}

export const groqClientAdapter = ({
  groq,
}: {
  groq: Groq
}) => ({
  'https://api.openai.com/v1/chat/completions': {
    // @ts-ignore-next-line
    post: async (_url: string, options: any): CreateResponse => {
      const body = JSON.parse(options.body)
      // console.log({ body })

      if (body.stream) {
        // console.dir({ body }, { depth: null })
        console.log("STREAIMNG")

        const response = await groq.chat.completions.create(body)
        // console.log({ response })

        // @ts-ignore-next-line
        return new Response(streamToReadable(response), {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'connection': 'keep-alive',
            'Cache-Control': 'no-cache',
          },
        })
      } else {
        try {
          const data = await groq.chat.completions.create(body)

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
