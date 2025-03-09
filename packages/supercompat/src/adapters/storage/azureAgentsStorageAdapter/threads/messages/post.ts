import type { AIProjectsClient, ThreadMessageOutput } from '@azure/ai-projects'
import type OpenAI from 'openai'
import type { PrismaClient } from '@prisma/client'
import { serializeMessage } from './serializeMessage'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'

type MessageCreateResponse = Response & {
  json: () => Promise<ReturnType<OpenAI.Beta.Threads.Messages['create']>>
}

const messageContentBlocks = ({
  content,
}: {
  content: string
}) => ([
  {
    type: 'text',
    text: {
      value: content ?? '',
      annotations: [],
    },
  },
])

export const post = ({
  azureAiProjectsClient,
}: {
  azureAiProjectsClient: AIProjectsClient
}) => async (urlString: string, options: any): Promise<MessageCreateResponse> => {
  const url = new URL(urlString)

  const [, threadId] = url.pathname.match(new RegExp(messagesRegexp))!

  const body = JSON.parse(options.body)
  const {
    role,
    content,
    attachments = null,
    metadata = null,
  } = body

  const message = await azureAiProjectsClient.agents.createMessage(threadId, {
    content,
    role,
    attachments,
    metadata,
  })

  console.dir({ message }, { depth: null })
  return new Response(JSON.stringify(
    serializeMessage({ message }),
  ), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
