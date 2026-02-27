import type { ResponseOutputItem } from '@prisma/client'
import dayjs from 'dayjs'

export const serializeOutputItem = ({
  outputItem,
}: {
  outputItem: ResponseOutputItem
}) => {
  if (outputItem.type === 'MESSAGE') {
    return {
      id: outputItem.id,
      object: 'realtime.item' as const,
      type: 'message' as const,
      status: outputItem.status.toLowerCase(),
      role: outputItem.role ?? 'assistant',
      content: outputItem.content ?? [],
    }
  }

  // FUNCTION_CALL
  return {
    id: outputItem.id,
    object: 'realtime.item' as const,
    type: 'function_call' as const,
    status: outputItem.status.toLowerCase(),
    call_id: outputItem.callId ?? '',
    name: outputItem.name ?? '',
    arguments: outputItem.arguments ?? '',
  }
}
