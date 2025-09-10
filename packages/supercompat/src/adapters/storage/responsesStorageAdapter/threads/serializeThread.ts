import type { OpenAI } from 'openai'
import dayjs from 'dayjs'

export const serializeThread = ({
  conversation,
}: {
  conversation: OpenAI.Conversations.Conversation
}) => ({
  id: conversation.id,
  object: 'thread' as 'thread',
  created_at: dayjs(conversation.created_at).unix(),
  metadata: conversation.metadata,
  // TODO
  tool_resources: null,
})
