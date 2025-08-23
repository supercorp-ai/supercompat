import OpenAI from 'openai'
import dayjs from 'dayjs'

export const post = ({ openai }: { openai: OpenAI }) => async (
  _urlString: string,
  options: any,
): Promise<Response> => {
  const body = options?.body ? JSON.parse(options.body) : {}

  const conversation = await openai.conversations.create({
    metadata: body.metadata || {},
  })

  const thread = {
    id: conversation.id,
    object: 'thread',
    created_at: conversation.created_at ?? dayjs().unix(),
    metadata: conversation.metadata || {},
    tool_resources: null,
    openaiConversationId: conversation.id,
  }

  return new Response(JSON.stringify(thread), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
