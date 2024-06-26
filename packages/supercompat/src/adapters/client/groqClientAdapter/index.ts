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
  const asyncIterator = createAsyncIterator(stream)

  return new Readable({
    async read() {
      try {
        const { value, done } = await asyncIterator.next();

        // console.log({ value })
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
        const innerBody = new ReadableStream({
          async start(controller) {
            // @ts-ignore-next-line
            for await (const chunk of response) {
              controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`)
              // controller.enqueue(`data: {"id":"chatcmpl-74u2nvww9E1TqTmZtXwxeOSQsx56L","object":"chat.completion.chunk","created":1681403101,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"role":"assistant"},"index":0,"finish_reason":null}]}\n\n`)
            }

            controller.close()

            // timerId = setInterval(() => {
            //   const msg = new TextEncoder().encode(texts[i])
            //   controller.enqueue(msg)
            //   i++;
            // }, 500)
            // setTimeout(() => {
            //   this.cancel?.()
            //   try{
            //     controller.close()
            //   }catch(e){
            //
            //   }
            // }, num * 500 + 100)
          },
          cancel() {
            // @ts-ignore-next-line
            // clearInterval(timerId)
          }
        })

// const texts = [
//     `data: {"id":"chatcmpl-74u2nvww9E1TqTmZtXwxeOSQsx56L","object":"chat.completion.chunk","created":1681403101,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"role":"assistant"},"index":0,"finish_reason":null}]}\n\n`,
//     `data: {"id":"chatcmpl-74u2nvww9E1TqTmZtXwxeOSQsx56L","object":"chat.completion.chunk","created":1681403101,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"content":"${Math.random()}The"},"index":0,"finish_reason":null}]}\n\n`,
//     `data: {"id":"chatcmpl-74u2nvww9E1TqTmZtXwxeOSQsx56L","object":"chat.completion.chunk","created":1681403101,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"content":" **White"},"index":0,"finish_reason":null}]}\n\n`,
//     `data: {"id":"chatcmpl-74u2nvww9E1TqTmZtXwxeOSQsx56L","object":"chat.completion.chunk","created":1681403101,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"content":" House**"},"index":0,"finish_reason":null}]}\n\n`,
//     `data: {"id":"chatcmpl-74u2nvww9E1TqTmZtXwxeOSQsx56L","object":"chat.completion.chunk","created":1681403101,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"content":" is"},"index":0,"finish_reason":null}]}\n\n`,
//     `data: {"id":"chatcmpl-74u2nvww9E1TqTmZtXwxeOSQsx56L","object":"chat.completion.chunk","created":1681403101,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"content":" *the"},"index":0,"finish_reason":null}]}\n\n`,
//     `data: {"id":"chatcmpl-74u2nvww9E1TqTmZtXwxeOSQsx56L","object":"chat.completion.chunk","created":1681403101,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"content":" official*"},"index":0,"finish_reason":null}]}\n\n`,
//     `data: {"id":"chatcmpl-74u2nvww9E1TqTmZtXwxeOSQsx56L","object":"chat.completion.chunk","created":1681403101,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"content":" residence"},"index":0,"finish_reason":null}]}\n\n`,
//     `data: [DONE]\n\n`
//   ];
//
//   // @ts-ignore-next-line
//   let timerId
//   const num = texts.length;
//   let i =0;

  // const innerBody = new ReadableStream({
  //   start(controller) {
  //     timerId = setInterval(() => {
  //       const msg = new TextEncoder().encode(texts[i])
  //       controller.enqueue(msg)
  //       i++;
  //     }, 500)
  //     setTimeout(() => {
  //       this.cancel?.()
  //       try{
  //         controller.close()
  //       }catch(e){
  //
  //       }
  //     }, num * 500 + 100)
  //   },
  //   cancel() {
  //     // @ts-ignore-next-line
  //     clearInterval(timerId)
  //   }
  // })
        return new Response(innerBody, {
          headers: {
            "Content-Type": "text/event-stream",
          },
        });


        // // @ts-ignore-next-line
        // return new Response(new Readable({
        //   read() {
        //     this.push('data: 123')
        //     this.push(null)
        //   }
        // }), {
        //   headers: {
        //     'Content-Type': 'text/event-stream; charset=utf-8',
        //     'connection': 'keep-alive',
        //     'Cache-Control': 'no-cache',
        //   },
        // })
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
