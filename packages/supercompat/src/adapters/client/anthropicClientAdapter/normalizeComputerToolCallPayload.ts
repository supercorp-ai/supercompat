import { omit } from 'radash'

type Coordinates = { x: number; y: number }

const coordinateKeys = ['coordinate', 'coordinates', 'position', 'point', 'cursor_position']

const extractCoordinates = (value: unknown): Coordinates | undefined => {
  if (Array.isArray(value) && value.length >= 2) {
    const [x, y] = value
    if (typeof x === 'number' && typeof y === 'number') {
      return { x, y }
    }
  }

  if (value && typeof value === 'object') {
    const maybeObject = value as Record<string, unknown>
    const { x, y } = maybeObject
    if (typeof x === 'number' && typeof y === 'number') {
      return { x, y }
    }
  }

  return undefined
}

const normalizedClickAction = (button: string, details: Record<string, unknown>) => {
  const action: Record<string, unknown> = {
    type: 'click',
    button,
  }

  for (const key of coordinateKeys) {
    const coords = extractCoordinates(details[key])
    if (coords) {
      action.x = coords.x
      action.y = coords.y
      break
    }
  }

  return {
    ...action,
    ...omit(details, coordinateKeys),
  }
}

const mapActionString = (action: string, details: Record<string, unknown>) => {
  switch (action) {
    case 'screenshot':
      return { type: 'screenshot', ...omit(details, coordinateKeys) }
    case 'left_click':
      return normalizedClickAction('left', details)
    case 'right_click':
      return normalizedClickAction('right', details)
    case 'middle_click':
      return normalizedClickAction('middle', details)
    case 'double_click': {
      const result: Record<string, unknown> = { type: 'double_click' }
      const coords = coordinateKeys
        .map((key) => extractCoordinates(details[key]))
        .find((value): value is Coordinates => Boolean(value))
      if (coords) {
        result.x = coords.x
        result.y = coords.y
      }
      return {
        ...result,
        ...omit(details, coordinateKeys),
      }
    }
    case 'scroll': {
      const result: Record<string, unknown> = { type: 'scroll' }
      const coords = coordinateKeys
        .map((key) => extractCoordinates(details[key]))
        .find((value): value is Coordinates => Boolean(value))
      if (coords) {
        result.x = coords.x
        result.y = coords.y
      }

      if (typeof details.scroll_direction === 'string') {
        result.direction = details.scroll_direction
      } else if (typeof details.direction === 'string') {
        result.direction = details.direction
      }

      if (typeof details.scroll_amount === 'number') {
        result.amount = details.scroll_amount
      } else if (typeof details.amount === 'number') {
        result.amount = details.amount
      }

      return {
        ...result,
        ...omit(details, [
          ...coordinateKeys,
          'scroll_direction',
          'direction',
          'scroll_amount',
          'amount',
        ]),
      }
    }
    case 'type': {
      const result: Record<string, unknown> = { type: 'type' }
      if (typeof details.text === 'string') {
        result.text = details.text
      }
      return {
        ...result,
        ...omit(details, [...coordinateKeys, 'text']),
      }
    }
    case 'key': {
      const result: Record<string, unknown> = { type: 'key' }
      if (typeof details.key === 'string') {
        result.key = details.key
      }
      return {
        ...result,
        ...omit(details, [...coordinateKeys, 'key']),
      }
    }
    case 'mouse_move':
    case 'move': {
      const result: Record<string, unknown> = { type: 'move' }
      const coords = coordinateKeys
        .map((key) => extractCoordinates(details[key]))
        .find((value): value is Coordinates => Boolean(value))
      if (coords) {
        result.x = coords.x
        result.y = coords.y
      }
      return {
        ...result,
        ...omit(details, coordinateKeys),
      }
    }
    default: {
      const result: Record<string, unknown> = { type: action }
      const coords = coordinateKeys
        .map((key) => extractCoordinates(details[key]))
        .find((value): value is Coordinates => Boolean(value))
      if (coords) {
        result.x = coords.x
        result.y = coords.y
      }
      return {
        ...result,
        ...omit(details, coordinateKeys),
      }
    }
  }
}

const normalizeAction = (payload: any): Record<string, unknown> => {
  if (payload && typeof payload === 'object') {
    const action = payload.action

    if (action && typeof action === 'object' && typeof action.type === 'string') {
      return action as Record<string, unknown>
    }

    if (typeof action === 'string') {
      const details = omit(payload, ['action', 'pending_safety_checks', 'status'])
      return mapActionString(action, details)
    }

    if (payload.type && typeof payload.type === 'string') {
      return payload as Record<string, unknown>
    }
  }

  if (typeof payload === 'string') {
    return { type: payload }
  }

  return { type: 'unknown', value: payload }
}

export const normalizeComputerToolCallPayload = (payload: any) => {
  const pendingSafetyChecks = Array.isArray(payload?.pending_safety_checks)
    ? payload.pending_safety_checks
    : []

  const normalizedAction = normalizeAction(payload)

  const result: {
    action: Record<string, unknown>
    pending_safety_checks: unknown[]
    status?: unknown
  } = {
    action: normalizedAction,
    pending_safety_checks: pendingSafetyChecks,
  }

  if (payload && typeof payload === 'object' && 'status' in payload) {
    result.status = payload.status
  }

  return result
}
