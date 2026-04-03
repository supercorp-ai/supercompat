import type OpenAI from 'openai'
import type { AIProjectClient } from '@azure/ai-projects'
import dayjs from 'dayjs'

type ThreadCreateResponse = Response & {
  json: () => Promise<OpenAI.Beta.Threads.Thread>
}

export const post =
  ({ azureAiProject }: { azureAiProject: AIProjectClient }) =>
  async (
    _urlString: string,
    options: RequestInit & { body?: string },
  ): Promise<ThreadCreateResponse> => {
    if (typeof options.body !== 'string') {
      throw new Error('Request body is required')
    }

    const body = JSON.parse(options.body)
    const metadata = body.metadata || {}

    const thread = await azureAiProject.agents.threads.create({
      metadata,
    })

    const openaiThread: OpenAI.Beta.Threads.Thread = {
      id: thread.id,
      object: 'thread',
      created_at: dayjs(thread.createdAt).unix(),
      metadata: thread.metadata || {},
      tool_resources: null,
    }

    return new Response(JSON.stringify(openaiThread), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
