import type { OpenAI } from 'openai'

export const serializeThread = ({
  conversation,
}: {
  conversation: OpenAI.Conversations.Conversation
}) => ({
  id: conversation.id,
  object: 'thread' as 'thread',
  created_at: conversation.created_at,
  metadata: conversation.metadata,
  // TODO
  tool_resources: null,
})
