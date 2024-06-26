import OpenAI from 'openai'
import { APIPromise } from 'openai/core'
import type { Stream } from 'openai/streaming'
import type Groq from 'groq-sdk'
import { PassThrough, Readable } from 'stream'

type CreateResponse = Response & {
  json: () => Promise<ReturnType<OpenAI.Beta.Threads.Runs['create']>>
}

// @ts-ignore-next-line
async function streamToReadableStream(stream) {
    const reader = stream.iterator();

    return new ReadableStream({
        async pull(controller) {
          const { value, done } = await reader.next();

          if (done) {
              controller.close();
          } else {
              controller.enqueue(value);
          }
        },
        cancel() {
          stream.controller.abort();
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
        const resp = new Response(streamToReadableStream(response), {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
          },
        })

        // @ts-ignore-next-line
        // for await (const chunk of response) {
        //   console.log({ chunk })
        // }

        return resp
        // @ts-ignore-next-line
        // console.log({wr: response.asResponse() })

        // const rs = await streamToReadableStream(response)
        //
        // const respo = new APIPromise(Promise.resolve({
        //   response: new Response(rs),
        //   options: {
        //     method: 'post',
        //     path: '/v1/chat/completions',
        //   },
        //   controller: new AbortController(),
        // })) as APIPromise<Stream<OpenAI.ChatCompletionChunk>>
        // // const respo = new Response(rs) as APIPromise<Stream<OpenAI.ChatCompletionChunk>>
        // console.log({ a: typeof rs, rs })
        //)
        // // @ts-ignore-next-line
        // // for await (const chunk of respo) {
        // //   console.log({ chunk })
        // // }
        // // @ts-ignore-next-line
        // return respo
        // return new Response(rs)

        // // @ts-ignore-next-line
        // const webStream = response.pipeThrough(new TransformStream({
        //   transform(chunk, controller) {
        //     controller.enqueue(chunk);
        //   },
        //   flush(controller) {
        //     // @ts-ignore-next-line
        //     controller.close();
        //   }
        // }))
        //
        // return new Response(webStream)

        // @ts-ignore-next-line
        // return new Response(Readable.toWeb(response))
      } else {
        try {
          const data = await groq.chat.completions.create(body)

          // const respo = new APIPromise(Promise.resolve({
          //   response: new Response(rs),
          //   options: {
          //     method: 'post',
          //     path: '/v1/chat/completions',
          //   },
          //   controller: new AbortController(),
          // })) as APIPromise<Stream<OpenAI.ChatCompletion>>
          //
          // return respo
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
