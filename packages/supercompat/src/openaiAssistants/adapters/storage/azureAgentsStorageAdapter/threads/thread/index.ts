import type { AIProjectClient } from '@azure/ai-projects'
import type OpenAI from 'openai'
import dayjs from 'dayjs'
import { threadRegexp } from '@/lib/threads/threadRegexp'
import type { RequestHandler } from '@/types'

const serializeThread = (thread: any): OpenAI.Beta.Threads.Thread => ({
  id: thread.id,
  object: 'thread',
  created_at: dayjs(thread.createdAt).unix(),
  metadata: thread.metadata || {},
  tool_resources: null,
})

const get = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}): RequestHandler => async (urlString: string) => {
  const url = new URL(urlString)
  const [, threadId] = url.pathname.match(new RegExp(threadRegexp))!

  const thread = await azureAiProject.agents.threads.get(threadId)

  return new Response(JSON.stringify(serializeThread(thread)), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const post = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}): RequestHandler => async (urlString: string, options: any) => {
  const url = new URL(urlString)
  const [, threadId] = url.pathname.match(new RegExp(threadRegexp))!
  const body = JSON.parse(options.body || '{}')

  const thread = await azureAiProject.agents.threads.update(threadId, {
    metadata: body.metadata,
  })

  return new Response(JSON.stringify(serializeThread(thread)), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const del = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}): RequestHandler => async (urlString: string) => {
  const url = new URL(urlString)
  const [, threadId] = url.pathname.match(new RegExp(threadRegexp))!

  await azureAiProject.agents.threads.delete(threadId)

  return new Response(JSON.stringify({
    id: threadId,
    object: 'thread.deleted',
    deleted: true,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const thread = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}): { get: RequestHandler; post: RequestHandler; delete: RequestHandler } => ({
  get: get({ azureAiProject }),
  post: post({ azureAiProject }),
  delete: del({ azureAiProject }),
})
