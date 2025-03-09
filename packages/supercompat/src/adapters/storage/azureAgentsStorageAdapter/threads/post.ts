import type { AIProjectsClient } from '@azure/ai-projects'
import type OpenAI from 'openai'
import dayjs from 'dayjs'
import { serializeThread } from './serializeThread'

type ThreadCreateResponse = Response & {
  json: () => Promise<OpenAI.Beta.Threads['create']>
}

export const post = ({
  azureAiProjectsClient,
}: {
  azureAiProjectsClient: AIProjectsClient
}) => async (...args: Parameters<OpenAI.Beta.Threads['create']>): Promise<ThreadCreateResponse> => {
  // @ts-ignore-next-line
  const body = JSON.parse(args[1].body)

  const messages = body.messages || []
  const metadata = body.metadata || {}

  const initialCreatedAt = dayjs().subtract(messages.length, 'seconds').format()

  console.log({ metadata, messages })
  const thread = await azureAiProjectsClient.agents.createThread({
    metadata,
    messages: messages.map((message: OpenAI.Beta.ThreadCreateParams.Message) => ({
      role: message.role,
      content: message.content,
      attachments: message.attachments,
      metadata: message.metadata,
    })),
  })

  return new Response(JSON.stringify(
    serializeThread({ thread }),
  ), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
