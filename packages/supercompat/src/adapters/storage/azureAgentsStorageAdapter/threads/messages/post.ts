import type OpenAI from 'openai'
import type { AIProjectClient } from '@azure/ai-projects'
import dayjs from 'dayjs'
import type { RunAdapterWithAssistant } from '@/types'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'

type MessageCreateResponse = Response & {
  json: () => Promise<OpenAI.Beta.Threads.Messages.Message>
}

export const post =
  ({
    azureAiProject,
    runAdapter,
  }: {
    azureAiProject: AIProjectClient
    runAdapter: RunAdapterWithAssistant
  }) =>
  async (
    urlString: string,
    options: RequestInit & { body?: string },
  ): Promise<MessageCreateResponse> => {
    const url = new URL(urlString)
    const [, threadId] = url.pathname.match(new RegExp(messagesRegexp))!

    if (typeof options.body !== 'string') {
      throw new Error('Request body is required')
    }

    const body = JSON.parse(options.body)
    const { role, content } = body

    // Extract text content
    let textContent = ''
    if (typeof content === 'string') {
      textContent = content
    } else if (Array.isArray(content)) {
      const textItem = content.find((item: any) => item.type === 'text')
      if (textItem) {
        textContent = textItem.text
      }
    }

    const message = await azureAiProject.agents.messages.create(
      threadId,
      role,
      textContent,
    )

    const openaiAssistant = await runAdapter.getOpenaiAssistant({
      select: { id: true },
    })

    const openaiMessage: OpenAI.Beta.Threads.Message = {
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
              annotations: [],
            },
          }
        }
        return c
      }),
      assistant_id: openaiAssistant.id,
      run_id: null,
      attachments: [],
      metadata: message.metadata || {},
      status: 'completed',
      completed_at: dayjs(message.createdAt).unix(),
      incomplete_at: null,
      incomplete_details: null,
    }

    return new Response(JSON.stringify(openaiMessage), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
