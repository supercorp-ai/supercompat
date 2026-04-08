// @ts-ignore-next-line
import type { Assistant } from '@prisma/client'
import dayjs from 'dayjs'

export const serializeAssistant = ({
  assistant,
}: {
  assistant: Assistant
}) => ({
  id: assistant.id,
  object: 'assistant' as 'assistant',
  created_at: dayjs(assistant.createdAt).unix(),
  name: assistant.name ?? null,
  description: assistant.description ?? null,
  model: assistant.modelSlug ?? '',
  instructions: assistant.instructions ?? null,
  tools: [],
  metadata: assistant.metadata ?? {},
  top_p: 1.0,
  temperature: 1.0,
  reasoning_effort: null,
  response_format: 'auto',
  tool_resources: {},
})
