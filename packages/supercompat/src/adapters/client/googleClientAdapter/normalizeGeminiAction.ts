// Known Gemini computer-use action names
const GEMINI_ACTION_NAMES = new Set([
  'click_at', 'single_click_at', 'right_click_at', 'double_click_at', 'triple_click_at',
  'hover_at', 'type_text_at', 'key_combination', 'scroll_at', 'scroll_document',
  'drag_and_drop', 'wait_5_seconds', 'wait_for_load',
])

export const isGeminiAction = (name: string) => GEMINI_ACTION_NAMES.has(name)

type NormalizedAction = { action: Record<string, unknown>; pending_safety_checks: unknown[] }

const act = (action: Record<string, unknown>): NormalizedAction => ({
  action,
  pending_safety_checks: [],
})

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
): NormalizedAction[] => {
  const x = typeof args.x === 'number' ? args.x
    : typeof args.coordinate_x === 'number' ? args.coordinate_x
    : 0
  const y = typeof args.y === 'number' ? args.y
    : typeof args.coordinate_y === 'number' ? args.coordinate_y
    : 0

  switch (name) {
    case 'click_at':
    case 'single_click_at':
      return [act({ type: 'click', button: 'left', x, y })]

    case 'right_click_at':
      return [act({ type: 'click', button: 'right', x, y })]

    case 'double_click_at':
      return [act({ type: 'double_click', x, y })]

    case 'triple_click_at':
      return [act({ type: 'double_click', x, y, repetitions: 3 })]

    case 'hover_at':
      return [act({ type: 'move', x, y })]

    case 'type_text_at': {
      const text = typeof args.text === 'string' ? args.text : ''
      const clearBeforeTyping = args.clear_before_typing !== false
      const pressEnter = args.press_enter !== false
      const actions: NormalizedAction[] = [
        act({ type: 'click', button: 'left', x, y }),
      ]
      if (clearBeforeTyping) {
        actions.push(act({ type: 'keypress', keys: ['ctrl', 'a'] }))
        actions.push(act({ type: 'keypress', keys: ['Backspace'] }))
      }
      actions.push(act({ type: 'type', text }))
      if (pressEnter) {
        actions.push(act({ type: 'keypress', keys: ['Return'] }))
      }
      return actions
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
      return [act({ type: 'keypress', keys })]
    }

    case 'scroll_at': {
      const direction = typeof args.direction === 'string' ? args.direction : undefined
      const amount = typeof args.amount === 'number' ? args.amount : 3
      const { scroll_x, scroll_y } = scrollFromDirection(direction, amount)
      return [act({ type: 'scroll', x, y, scroll_x, scroll_y })]
    }

    case 'scroll_document': {
      const direction = typeof args.direction === 'string' ? args.direction : undefined
      const amount = typeof args.amount === 'number' ? args.amount : 3
      const { scroll_x, scroll_y } = scrollFromDirection(direction, amount)
      return [act({ type: 'scroll', x: 640, y: 360, scroll_x, scroll_y })]
    }

    case 'drag_and_drop': {
      const destX = typeof args.destination_x === 'number' ? args.destination_x : 0
      const destY = typeof args.destination_y === 'number' ? args.destination_y : 0
      return [act({ type: 'drag', path: [{ x, y }, { x: destX, y: destY }] })]
    }

    case 'wait_5_seconds':
    case 'wait_for_load':
      return [act({ type: 'wait' })]

    // navigate, go_back, go_forward, open_web_browser, search are excluded
    // via excludedPredefinedFunctions in the tool config

    default:
      return [act({ type: name, ...args })]
  }
}
