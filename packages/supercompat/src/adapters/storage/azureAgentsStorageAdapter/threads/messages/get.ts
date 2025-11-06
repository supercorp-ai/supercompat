import type OpenAI from 'openai'
import type { AIProjectClient } from '@azure/ai-projects'
import dayjs from 'dayjs'
import type { RunAdapterWithAssistant } from '@/types'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'

type MessageListResponse = Response & {
  json: () => Promise<OpenAI.Beta.Threads.Messages.MessagesPage>
}

export const get =
  ({
    azureAiProject,
    runAdapter,
  }: {
    azureAiProject: AIProjectClient
    runAdapter: RunAdapterWithAssistant
  }) =>
  async (urlString: string): Promise<MessageListResponse> => {
    const url = new URL(urlString)
    const [, threadId] = url.pathname.match(new RegExp(messagesRegexp))!

    const order = url.searchParams.get('order') || 'desc'

    const messages = await azureAiProject.agents.messages.list(threadId, {
      order: order as 'asc' | 'desc',
    })

    const openaiAssistant = await runAdapter.getOpenaiAssistant({
      select: { id: true },
    })

    const messagesList: OpenAI.Beta.Threads.Message[] = []
    for await (const message of messages) {
      messagesList.push({
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
      })
    }

    const response = {
      data: messagesList,
      first_id: messagesList[0]?.id || null,
      last_id: messagesList[messagesList.length - 1]?.id || null,
      has_more: false,
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
