// Known Gemini computer-use action names
const GEMINI_ACTION_NAMES = new Set([
  'click_at', 'single_click_at', 'right_click_at', 'double_click_at', 'triple_click_at',
  'hover_at', 'type_text_at', 'key_combination', 'scroll_at', 'scroll_document',
  'drag_and_drop', 'wait_5_seconds', 'wait_for_load', 'navigate',
  'go_back', 'go_forward', 'open_web_browser',
])

export const isGeminiAction = (name: string) => GEMINI_ACTION_NAMES.has(name)

const normalizeGeminiKey = (key: string): string => {
  const lower = key.toLowerCase()
  switch (lower) {
    case 'control': return 'ctrl'
    case 'command': case 'cmd': return 'meta'
    case 'option': return 'alt'
    default: return lower
  }
}

const scrollFromDirection = (
  direction: string | undefined,
  amount: number,
): { scroll_x: number; scroll_y: number } => {
  if (!direction) return { scroll_x: 0, scroll_y: 0 }
  switch (direction.toLowerCase()) {
    case 'up': return { scroll_x: 0, scroll_y: -amount }
    case 'down': return { scroll_x: 0, scroll_y: amount }
    case 'left': return { scroll_x: -amount, scroll_y: 0 }
    case 'right': return { scroll_x: amount, scroll_y: 0 }
    default: return { scroll_x: 0, scroll_y: 0 }
  }
}

export const normalizeGeminiAction = (
  name: string,
  args: Record<string, unknown>,
): { action: Record<string, unknown>; pending_safety_checks: unknown[] } => {
  const x = typeof args.x === 'number' ? args.x
    : typeof args.coordinate_x === 'number' ? args.coordinate_x
    : 0
  const y = typeof args.y === 'number' ? args.y
    : typeof args.coordinate_y === 'number' ? args.coordinate_y
    : 0

  switch (name) {
    case 'click_at':
    case 'single_click_at':
      return {
        action: { type: 'click', button: 'left', x, y },
        pending_safety_checks: [],
      }

    case 'right_click_at':
      return {
        action: { type: 'click', button: 'right', x, y },
        pending_safety_checks: [],
      }

    case 'double_click_at':
      return {
        action: { type: 'double_click', x, y },
        pending_safety_checks: [],
      }

    case 'triple_click_at':
      return {
        action: { type: 'double_click', x, y, repetitions: 3 },
        pending_safety_checks: [],
      }

    case 'hover_at':
      return {
        action: { type: 'move', x, y },
        pending_safety_checks: [],
      }

    case 'type_text_at': {
      const text = typeof args.text === 'string' ? args.text : ''
      const pendingActions: Record<string, unknown>[] = [
        { type: 'type', text },
      ]
      if (args.submit_after_type === true) {
        pendingActions.push({ type: 'keypress', keys: ['Return'] })
      }
      return {
        action: { type: 'click', button: 'left', x, y, pending_actions: pendingActions },
        pending_safety_checks: [],
      }
    }

    case 'key_combination': {
      const rawKeys = args.keys
      let keys: string[]
      if (Array.isArray(rawKeys)) {
        keys = rawKeys.map(String).map(normalizeGeminiKey)
      } else if (typeof rawKeys === 'string') {
        keys = rawKeys.split(/[+\s]+/).map(k => k.trim()).filter(Boolean).map(normalizeGeminiKey)
      } else {
        keys = []
      }
      return {
        action: { type: 'keypress', keys },
        pending_safety_checks: [],
      }
    }

    case 'scroll_at': {
      const direction = typeof args.direction === 'string' ? args.direction : undefined
      const amount = typeof args.amount === 'number' ? args.amount : 3
      const { scroll_x, scroll_y } = scrollFromDirection(direction, amount)
      return {
        action: { type: 'scroll', x, y, scroll_x, scroll_y },
        pending_safety_checks: [],
      }
    }

    case 'scroll_document': {
      const direction = typeof args.direction === 'string' ? args.direction : undefined
      const amount = typeof args.amount === 'number' ? args.amount : 3
      const { scroll_x, scroll_y } = scrollFromDirection(direction, amount)
      return {
        action: { type: 'scroll', x: 640, y: 360, scroll_x, scroll_y },
        pending_safety_checks: [],
      }
    }

    case 'drag_and_drop': {
      const destX = typeof args.destination_x === 'number' ? args.destination_x : 0
      const destY = typeof args.destination_y === 'number' ? args.destination_y : 0
      return {
        action: { type: 'drag', path: [{ x, y }, { x: destX, y: destY }] },
        pending_safety_checks: [],
      }
    }

    case 'wait_5_seconds':
    case 'wait_for_load':
      return {
        action: { type: 'wait' },
        pending_safety_checks: [],
      }

    case 'navigate': {
      const url = typeof args.url === 'string' ? args.url : ''
      return {
        action: {
          type: 'keypress',
          keys: ['ctrl', 'l'],
          pending_actions: [
            { type: 'wait' },
            { type: 'type', text: url },
            { type: 'keypress', keys: ['Return'] },
            { type: 'wait' },
          ],
        },
        pending_safety_checks: [],
      }
    }

    case 'go_back':
      return {
        action: { type: 'keypress', keys: ['alt', 'left'] },
        pending_safety_checks: [],
      }

    case 'go_forward':
      return {
        action: { type: 'keypress', keys: ['alt', 'right'] },
        pending_safety_checks: [],
      }

    case 'open_web_browser':
      return {
        action: { type: 'screenshot' },
        pending_safety_checks: [],
      }

    default:
      return {
        action: { type: name, ...args },
        pending_safety_checks: [],
      }
  }
}
