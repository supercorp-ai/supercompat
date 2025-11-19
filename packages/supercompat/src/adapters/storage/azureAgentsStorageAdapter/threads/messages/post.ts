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

    // Use assistantId and runId from the Azure message response
    // Azure docs show Message includes assistantId and runId fields
    const assistantId = (message as any).assistantId || (message as any).assistant_id || null
    const runId = (message as any).runId || (message as any).run_id || null

    const openaiMessage: OpenAI.Beta.Threads.Message = {
      id: message.id,
      object: 'thread.message',
      created_at: dayjs(message.createdAt).unix(),
      thread_id: message.threadId,
      role: message.role as 'user' | 'assistant',
      content: message.content.map((c: any) => {
        if (c.type === 'text' && 'text' in c) {
          // Map annotations from Azure's camelCase to OpenAI's snake_case
          const annotations = (c.text.annotations || []).map((ann: any) => {
            if (ann.type === 'file_citation') {
              return {
                type: 'file_citation' as const,
                text: ann.text,
                start_index: ann.startIndex,
                end_index: ann.endIndex,
                file_citation: {
                  file_id: ann.fileCitation?.fileId || ann.file_citation?.file_id,
                  quote: ann.fileCitation?.quote || ann.file_citation?.quote || '',
                },
              }
            } else if (ann.type === 'file_path') {
              return {
                type: 'file_path' as const,
                text: ann.text,
                start_index: ann.startIndex,
                end_index: ann.endIndex,
                file_path: {
                  file_id: ann.filePath?.fileId || ann.file_path?.file_id,
                },
              }
            }
            return ann
          })

          return {
            type: 'text' as const,
            text: {
              value: c.text.value,
              annotations,
            },
          }
        } else if (c.type === 'image_file') {
          const imageFile = c.image_file || c.imageFile || {}
          return {
            type: 'image_file' as const,
            image_file: {
              file_id: imageFile.file_id || imageFile.fileId || '',
              detail: imageFile.detail ?? 'auto',
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

    return new Response(JSON.stringify(openaiMessage), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
