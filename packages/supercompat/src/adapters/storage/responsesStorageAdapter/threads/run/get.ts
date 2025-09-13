import type OpenAI from 'openai'
import { runRegexp } from '@/lib/runs/runRegexp'

type GetResponse = Response & {
  json: () => Promise<ReturnType<OpenAI.Beta.Threads.Runs['retrieve']>>
}

export const get = ({
  openai,
}: {
  openai: OpenAI
}) => async (urlString: string): Promise<GetResponse> => {
  const url = new URL(urlString)

  const [, threadId, runId] = url.pathname.match(new RegExp(runRegexp))!

  throw new Error('Not implemented')


  // return
  // return new Response(JSON.stringify(
  //   serializeRun({ run })
  // ), {
  //   status: 200,
  //   headers: {
  //     'Content-Type': 'application/json',
  //     'openai-poll-after-ms': '5000',
  //   },
  // })
}
