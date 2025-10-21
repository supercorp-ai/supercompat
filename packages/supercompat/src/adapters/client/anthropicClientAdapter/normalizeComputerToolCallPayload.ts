import { omit } from 'radash'

type Coordinates = { x: number; y: number }

const coordinateKeys = [
  'coordinate',
  'coordinates',
  'coordinate_start',
  'coordinate_end',
  'start',
  'end',
  'from',
  'to',
  'target',
  'point',
  'position',
  'cursor_position',
  'path',
]

const clickButtonMap: Record<string, 'left' | 'right' | 'wheel' | 'back' | 'forward'> = {
  left_click: 'left',
  right_click: 'right',
  middle_click: 'wheel',
  double_click: 'left',
  triple_click: 'left',
  left_mouse_down: 'left',
  left_mouse_up: 'left',
}

const keyAliasMap: Record<string, string> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  cmd: 'meta',
  command: 'meta',
  meta: 'meta',
  win: 'meta',
  option: 'alt',
  alt: 'alt',
  shift: 'shift',
  enter: 'enter',
  return: 'enter',
  esc: 'escape',
  escape: 'escape',
  tab: 'tab',
  space: 'space',
  spacebar: 'space',
  backspace: 'backspace',
  del: 'delete',
  delete: 'delete',
  pageup: 'pageup',
  pagedown: 'pagedown',
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
}

const sanitizeNumber = (value: unknown) => (typeof value === 'number' ? value : undefined)

const toCoordinate = (value: unknown): Coordinates | undefined => {
  if (!value) return undefined

  if (Array.isArray(value)) {
    if (value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      return { x: value[0], y: value[1] }
    }

    if (value.length > 0 && Array.isArray(value[0])) {
      const tuple = value[0]
      if (tuple.length === 2 && typeof tuple[0] === 'number' && typeof tuple[1] === 'number') {
        return { x: tuple[0], y: tuple[1] }
      }
    }
  }

  if (typeof value === 'object') {
    const maybe = value as Record<string, unknown>
    const x = sanitizeNumber(maybe.x)
    const y = sanitizeNumber(maybe.y)
    if (typeof x === 'number' && typeof y === 'number') {
      return { x, y }
    }
  }

  if (typeof value === 'string') {
    const parts = value.split(/[, ]+/).map(Number).filter(Number.isFinite)
    if (parts.length >= 2) {
      return { x: parts[0], y: parts[1] }
    }
  }

  return undefined
}

const findCoordinatesInDetails = (details: Record<string, unknown>) => {
  for (const key of coordinateKeys) {
    const value = details[key]
    const coords = toCoordinate(value)
    if (coords) {
      return coords
    }
  }

  return undefined
}

const buildDragPath = (details: Record<string, unknown>): Coordinates[] => {
  const path: Coordinates[] = []

  if (Array.isArray(details.path)) {
    for (const point of details.path) {
      const coords = toCoordinate(point)
      if (coords) {
        path.push(coords)
      }
    }
  }

  if (!path.length) {
    const start =
      toCoordinate(details.coordinate_start) ||
      toCoordinate(details.start) ||
      toCoordinate(details.from)
    if (start) {
      path.push(start)
    }

    const end =
      toCoordinate(details.coordinate_end) ||
      toCoordinate(details.end) ||
      toCoordinate(details.to) ||
      toCoordinate(details.target)
    if (end) {
      path.push(end)
    }
  }

  if (!path.length) {
    const coords = findCoordinatesInDetails(details)
    if (coords) {
      path.push(coords)
    }
  }

  if (!path.length) {
    path.push({ x: 0, y: 0 })
  }

  return path
}

const parseKeys = (input: unknown): string[] => {
  if (Array.isArray(input)) {
    return input.map(String).map((key) => key.trim()).filter(Boolean)
  }

  if (typeof input === 'string') {
    return input
      .split(/(?:(?<!\\)\+|\s+)/)
      .map((key) => key.replace(/\\\+/g, '+'))
      .map((key) => key.trim())
      .filter(Boolean)
  }

  return []
}

const normalizeKeys = (keys: string[]): string[] => {
  return keys.map((key) => {
    const lowerKey = key.toLowerCase()
    return keyAliasMap[lowerKey] ?? lowerKey
  })
}

const normalizeScroll = (details: Record<string, unknown>) => {
  let scrollX = sanitizeNumber(details.scroll_x) ?? 0
  let scrollY = sanitizeNumber(details.scroll_y) ?? 0
  const amount =
    sanitizeNumber(details.scroll_amount) ??
    sanitizeNumber(details.amount) ??
    0

  const direction = typeof details.scroll_direction === 'string'
    ? details.scroll_direction.toLowerCase()
    : typeof details.direction === 'string'
      ? details.direction.toLowerCase()
      : undefined

  if (!scrollX && !scrollY && direction && amount) {
    switch (direction) {
      case 'up':
        scrollY = -amount
        break
      case 'down':
        scrollY = amount
        break
      case 'left':
        scrollX = -amount
        break
      case 'right':
        scrollX = amount
        break
      default:
        break
    }
  }

  return { scroll_x: scrollX, scroll_y: scrollY }
}

const normalizeActionString = (
  action: string,
  details: Record<string, unknown>,
): Record<string, unknown> => {
  const coords = findCoordinatesInDetails(details)

  switch (action) {
    case 'screenshot':
      return { type: 'screenshot' }
    case 'left_click':
    case 'right_click':
    case 'middle_click': {
      return {
        type: 'click',
        button: clickButtonMap[action],
        x: coords?.x ?? 0,
        y: coords?.y ?? 0,
      }
    }
    case 'double_click':
      return {
        type: 'double_click',
        x: coords?.x ?? 0,
        y: coords?.y ?? 0,
      }
    case 'triple_click':
      return {
        type: 'double_click',
        x: coords?.x ?? 0,
        y: coords?.y ?? 0,
        repetitions: 3,
      }
    case 'left_mouse_down':
      return {
        type: 'click',
        button: clickButtonMap[action],
        state: 'down',
        x: coords?.x ?? 0,
        y: coords?.y ?? 0,
      }
    case 'left_mouse_up':
      return {
        type: 'click',
        button: clickButtonMap[action],
        state: 'up',
        x: coords?.x ?? 0,
        y: coords?.y ?? 0,
      }
    case 'left_click_drag': {
      const path = buildDragPath(details).map(({ x, y }) => ({ x, y }))
      return {
        type: 'drag',
        path,
      }
    }
    case 'mouse_move':
    case 'cursor_position':
      return {
        type: 'move',
        x: coords?.x ?? 0,
        y: coords?.y ?? 0,
      }
    case 'scroll': {
      const { scroll_x, scroll_y } = normalizeScroll(details)
      return {
        type: 'scroll',
        x: coords?.x ?? 0,
        y: coords?.y ?? 0,
        scroll_x,
        scroll_y,
        ...(typeof details.scroll_direction === 'string'
          ? { direction: details.scroll_direction }
          : typeof details.direction === 'string'
            ? { direction: details.direction }
            : {}),
        ...(typeof details.scroll_amount === 'number'
          ? { amount: details.scroll_amount }
          : typeof details.amount === 'number'
            ? { amount: details.amount }
            : {}),
      }
    }
    case 'type': {
      const text =
        typeof details.text === 'string'
          ? details.text
          : typeof details.input === 'string'
            ? details.input
            : ''
      return {
        type: 'type',
        text,
      }
    }
    case 'key':
    case 'hold_key': {
      const keys = normalizeKeys(
        parseKeys(details.text ?? details.keys ?? details.key),
      )
      const normalized: Record<string, unknown> = {
        type: 'keypress',
        keys,
      }

      if (action === 'hold_key') {
        const duration = sanitizeNumber(details.duration)
        if (typeof duration === 'number') {
          normalized.hold_duration_ms = Math.round(duration * 1000)
        }
      }

      return normalized
    }
    case 'wait': {
      const duration = sanitizeNumber(details.duration)
      return {
        type: 'wait',
        ...(typeof duration === 'number'
          ? { duration_ms: Math.round(duration * 1000) }
          : {}),
      }
    }
    default: {
      return {
        type: action,
        ...(coords ? { x: coords.x, y: coords.y } : {}),
        ...omit(details, [
          ...coordinateKeys,
          'text',
          'scroll_direction',
          'direction',
          'scroll_amount',
          'amount',
          'scroll_x',
          'scroll_y',
          'keys',
          'duration',
        ]),
      }
    }
  }
}

const normalizeAction = (payload: any): Record<string, unknown> => {
  if (payload && typeof payload === 'object') {
    if (payload.action && typeof payload.action === 'object' && typeof payload.action.type === 'string') {
      return payload.action
    }

    if (typeof payload.action === 'string') {
      const details = omit(payload, ['action', 'pending_safety_checks', 'status'])
      return normalizeActionString(payload.action, details)
    }

    if (typeof payload.type === 'string') {
      return payload
    }
  }

  if (typeof payload === 'string') {
    return { type: payload }
  }

  return {
    type: 'unknown',
    value: payload,
  }
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
