export interface SerializableOutputItem {
  id: string
  type: string
  status: string
  role?: string | null
  content?: unknown
  callId?: string | null
  name?: string | null
  arguments?: string | null
  actions?: unknown
  pendingSafetyChecks?: unknown
}

export const serializeOutputItem = ({
  outputItem,
}: {
  outputItem: SerializableOutputItem
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
      actions: outputItem.actions ?? [],
      pending_safety_checks: outputItem.pendingSafetyChecks ?? [],
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
