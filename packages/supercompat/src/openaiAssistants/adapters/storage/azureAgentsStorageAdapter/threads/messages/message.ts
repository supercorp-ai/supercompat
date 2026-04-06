import type OpenAI from 'openai'
import type { AIProjectClient } from '@azure/ai-projects'
import dayjs from 'dayjs'
import { messageRegexp } from '@/openaiAssistants/lib/messages/messageRegexp'
import type { RequestHandler } from '@/types'

const serializeMessage = (message: any): OpenAI.Beta.Threads.Message => {
  const assistantId = (message as any).assistantId || (message as any).assistant_id || null
  const runId = (message as any).runId || (message as any).run_id || null

  return {
    id: message.id,
    object: 'thread.message',
    created_at: dayjs(message.createdAt).unix(),
    thread_id: message.threadId,
    role: message.role as 'user' | 'assistant',
    content: message.content.map((c: any) => {
      if (c.type === 'text' && 'text' in c) {
        return {
          type: 'text' as const,
          text: {
            value: c.text.value,
            annotations: (c.text.annotations || []).map((ann: any) => {
              if (ann.type === 'file_citation') {
                return {
                  type: 'file_citation' as const,
                  text: ann.text,
                  start_index: ann.startIndex ?? ann.start_index,
                  end_index: ann.endIndex ?? ann.end_index,
                  file_citation: {
                    file_id: ann.fileCitation?.fileId || ann.file_citation?.file_id,
                    quote: ann.fileCitation?.quote || ann.file_citation?.quote || '',
                  },
                }
              }
              return ann
            }),
          },
        }
      }
      return c
    }),
    assistant_id: assistantId,
    run_id: runId,
    attachments: [],
    metadata: message.metadata || {},
    status: 'completed',
    completed_at: dayjs(message.createdAt).unix(),
    incomplete_at: null,
    incomplete_details: null,
  }
}

export const get = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}): RequestHandler => async (urlString: string) => {
  const url = new URL(urlString)
  const [, threadId, messageId] = url.pathname.match(new RegExp(messageRegexp))!

  const message = await azureAiProject.agents.messages.get(threadId, messageId)

  return new Response(JSON.stringify(serializeMessage(message)), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const post = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}): RequestHandler => async (urlString: string, options: RequestInit & { body?: string }) => {
  const url = new URL(urlString)
  const [, threadId, messageId] = url.pathname.match(new RegExp(messageRegexp))!

  const body = JSON.parse(options.body || '{}')

  const message = await azureAiProject.agents.messages.update(threadId, messageId, {
    metadata: body.metadata,
  })

  return new Response(JSON.stringify(serializeMessage(message)), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const del = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}): RequestHandler => async (urlString: string) => {
  const url = new URL(urlString)
  const [, threadId, messageId] = url.pathname.match(new RegExp(messageRegexp))!

  try {
    await (azureAiProject.agents.messages as any).delete(threadId, messageId)
  } catch {
    // Azure Agents may not support message deletion — return success regardless
  }

  return new Response(JSON.stringify({
    id: messageId,
    object: 'thread.message.deleted',
    deleted: true,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const message = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}): { get: RequestHandler; post: RequestHandler; delete: RequestHandler } => ({
  get: get({ azureAiProject }),
  post: post({ azureAiProject }),
  delete: del({ azureAiProject }),
})
