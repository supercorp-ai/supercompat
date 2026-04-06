import type { ResponseOutputItem } from '@prisma/client'

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

  if (outputItem.type === 'COMPUTER_CALL') {
    return {
      id: outputItem.id,
      object: 'realtime.item' as const,
      type: 'computer_call' as const,
      call_id: outputItem.callId ?? '',
      status: outputItem.status.toLowerCase(),
      actions: (outputItem as any).actions ?? [],
      pending_safety_checks: (outputItem as any).pendingSafetyChecks ?? [],
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
