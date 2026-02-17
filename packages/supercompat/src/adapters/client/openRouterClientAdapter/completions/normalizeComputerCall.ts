// Per-model quirks. Only models listed here get special treatment.
const MODEL_QUIRKS: Record<string, {
  // Coordinates are 0-1000 normalized (not pixels)
  normalizedCoords?: boolean
  // Model injects native tool format tags (<arg_key>, <arg_value>, <|begin_of_box|>)
  cleanArtifacts?: boolean
  // Model sometimes produces malformed JSON that needs fuzzy extraction
  fuzzyFallback?: boolean
}> = {
  'z-ai/glm-4.6v': { normalizedCoords: true, cleanArtifacts: true },
  'qwen/': { fuzzyFallback: true },
  'google/': { normalizedCoords: true },
}

export const getQuirks = (model: string) => {
  for (const [prefix, quirks] of Object.entries(MODEL_QUIRKS)) {
    if (model.startsWith(prefix)) return quirks
  }
  return {}
}

// --- GLM artifact cleanup (only applied when cleanArtifacts is true) ---

const cleanTextArtifacts = (text: string): string =>
  text
    .replace(/<\|begin_of_box\|>/g, '')
    .replace(/<\|end_of_box\|>/g, '')
    .replace(/<arg_key>[^<]*<\/arg_key>/g, '')
    .replace(/<\/arg_value>/g, '')
    .trim()

// GLM embeds its native tool format in the type field, e.g.:
// { type: "click\n<arg_key>parameters</arg_key>\n<arg_value>{\"type\":\"click\",\"x\":167,\"y\":622}" }
// Sorted by length desc so "double_click" is checked before "click"
const KNOWN_ACTION_TYPES = ['double_click', 'screenshot', 'keypress', 'scroll', 'click', 'move', 'type', 'drag', 'wait']

// Try to split a digit string into two valid 0-1000 coordinates
const splitCoordDigits = (numStr: string): { x: number; y: number } | null => {
  for (let i = 1; i < numStr.length; i++) {
    const x = parseInt(numStr.slice(0, i))
    const y = parseInt(numStr.slice(i))
    if (x >= 0 && x <= 1000 && y >= 0 && y <= 1000) {
      return { x, y }
    }
  }
  return null
}

const cleanGlmAction = (action: Record<string, unknown>): Record<string, unknown> => {
  const typeVal = action.type
  if (typeof typeVal !== 'string') return action

  // Try extracting JSON from embedded <arg_value>{...} in the type field
  const argValueMatch = typeVal.match(/<arg_value>\s*(\{[\s\S]*\})\s*$/)
  if (argValueMatch) {
    const inner = parseJson(argValueMatch[1])
    if (inner && typeof inner === 'object') {
      return inner
    }
  }

  // Strip all tags and whitespace
  const cleanedType = typeVal
    .replace(/<\/?[^>]+>/g, '')
    .replace(/\n/g, '')
    .trim()

  // Check if type starts with a known action type followed by garbage
  // Handles: "clickclick167622" → click + 167, 622
  //          "click167621" → click + 167, 621
  for (const actionType of KNOWN_ACTION_TYPES) {
    if (cleanedType.startsWith(actionType) && cleanedType !== actionType) {
      const rest = cleanedType.slice(actionType.length)
      const nums = rest.match(/\d+/g)
      if (nums && nums.length >= 2) {
        return { ...action, type: actionType, x: parseInt(nums[0]), y: parseInt(nums[1]) }
      }
      // Single concatenated number: try to split into valid 0-1000 coordinate pair
      if (nums && nums.length === 1 && nums[0].length >= 2) {
        const coords = splitCoordDigits(nums[0])
        if (coords) {
          return { ...action, type: actionType, ...coords }
        }
      }
      // No coordinates, just duplicated/garbled type name
      return { ...action, type: actionType }
    }
  }

  if (cleanedType === typeVal) return action

  return { ...action, type: cleanedType }
}

// E.g. x: "167</arg_key>\n\n<arg_value>620" → extract x=167, y=620
const cleanGlmFields = (action: Record<string, unknown>): Record<string, unknown> => {
  const result = { ...action }

  if (typeof result.x === 'string') {
    const nums = (result.x as string).match(/\d+/g)
    if (nums && nums.length >= 2) {
      result.x = parseInt(nums[0])
      if (result.y === undefined || typeof result.y === 'string') {
        result.y = parseInt(nums[1])
      }
    } else if (nums && nums.length === 1) {
      result.x = parseInt(nums[0])
    }
  }

  if (typeof result.y === 'string') {
    const nums = (result.y as string).match(/\d+/g)
    if (nums && nums.length >= 1) {
      result.y = parseInt(nums[0])
    }
  }

  for (const key of ['scroll_x', 'scroll_y'] as const) {
    if (typeof result[key] === 'string') {
      const nums = (result[key] as string).match(/\d+/g)
      if (nums) result[key] = parseInt(nums[0])
    }
  }

  if (typeof result.type === 'string') {
    result.type = (result.type as string)
      .replace(/<[^>]*>/g, '')
      .replace(/^\{|\}$/g, '')
      .replace(/\n/g, '')
      .trim()
  }

  return result
}

const applyArtifactCleanup = (action: Record<string, unknown>): Record<string, unknown> =>
  cleanGlmFields(cleanGlmAction(action))

// --- Generic helpers ---

const parseJson = (text: string): any => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const extractJson = (text: string): any => {
  const direct = parseJson(text)
  if (direct) return direct

  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    const parsed = parseJson(codeBlockMatch[1].trim())
    if (parsed) return parsed
  }

  const jsonMatch = text.match(/(\{[\s\S]*\})\s*$/)
  if (jsonMatch) {
    const parsed = parseJson(jsonMatch[1].trim())
    if (parsed) return parsed
  }

  return undefined
}

// Fuzzy extraction for severely malformed output
const fuzzyExtractJson = (text: string): any => {
  const clickMatch = text.match(/"action"\s*:\s*"click"\s*,\s*"x"\s*:\s*\[?\s*(\d+)\s*,\s*(\d+)/)
  if (clickMatch) {
    return { action: { type: 'click', x: parseInt(clickMatch[1]), y: parseInt(clickMatch[2]) } }
  }

  const actionTypeMatch = text.match(/"type"\s*:\s*"(\w+)"/)
  if (actionTypeMatch) {
    const result: Record<string, unknown> = { type: actionTypeMatch[1] }
    const xMatch = text.match(/"x"\s*:\s*\[?\s*(\d+)/)
    const yMatch = text.match(/"y"\s*:\s*(\d+)/)
    if (xMatch) result.x = parseInt(xMatch[1])
    if (yMatch) {
      result.y = parseInt(yMatch[1])
    } else if (xMatch) {
      // Handle malformed array-like coords: "x": 168, 621] or "x": [168, 621]
      const afterX = text.slice((xMatch.index ?? 0) + xMatch[0].length)
      const nextNum = afterX.match(/\s*,?\s*(\d+)/)
      if (nextNum) result.y = parseInt(nextNum[1])
    }
    const textMatch = text.match(/"text"\s*:\s*"([^"]*)"/)
    if (textMatch) result.text = textMatch[1]
    return { action: result }
  }

  return undefined
}

const denormalize = (
  value: number,
  dimension: number,
): number => Math.round((value / 1000) * dimension)

const denormalizeAction = (
  action: Record<string, unknown>,
  displayWidth: number,
  displayHeight: number,
): Record<string, unknown> => {
  const result = { ...action }

  if (typeof result.x === 'number') {
    result.x = denormalize(result.x as number, displayWidth)
  }
  if (typeof result.y === 'number') {
    result.y = denormalize(result.y as number, displayHeight)
  }

  if (Array.isArray(result.path)) {
    result.path = (result.path as any[]).map((point) => {
      if (point && typeof point === 'object') {
        return {
          ...point,
          ...(typeof point.x === 'number' ? { x: denormalize(point.x, displayWidth) } : {}),
          ...(typeof point.y === 'number' ? { y: denormalize(point.y, displayHeight) } : {}),
        }
      }
      return point
    })
  }

  return result
}

// --- Structure normalization (universal — any model might produce flat format) ---

const COORD_FIELDS = ['x', 'y', 'text', 'keys', 'button', 'direction', 'scroll_x', 'scroll_y', 'path']

const normalizeStructure = (
  parsed: Record<string, unknown>,
  shouldCleanArtifacts: boolean,
): Record<string, unknown> => {
  const clean = shouldCleanArtifacts
    ? (action: Record<string, unknown>) => applyArtifactCleanup(action)
    : (action: Record<string, unknown>) => action

  // Already nested: { action: { type: 'click', ... } }
  if (parsed.action && typeof parsed.action === 'object') {
    return { ...parsed, action: clean(parsed.action as Record<string, unknown>) }
  }

  // Flat with string action: { action: 'click', x: 168, y: 622 }
  if (typeof parsed.action === 'string') {
    const actionObj: Record<string, unknown> = { type: parsed.action }
    const rest: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (key === 'action') continue
      if (COORD_FIELDS.includes(key)) {
        actionObj[key] = value
      } else {
        rest[key] = value
      }
    }
    return { ...rest, action: clean(actionObj) }
  }

  // Flat without action key: { type: 'click', x: 168, y: 622 }
  if (typeof parsed.type === 'string') {
    const actionObj: Record<string, unknown> = {}
    const rest: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (key === 'type' || COORD_FIELDS.includes(key)) {
        actionObj[key] = value
      } else {
        rest[key] = value
      }
    }
    return { ...rest, action: clean(actionObj) }
  }

  return parsed
}

// --- Main entry point ---

export const denormalizeComputerCallArguments = ({
  argumentsText,
  displayWidth,
  displayHeight,
  model,
}: {
  argumentsText: string
  displayWidth: number
  displayHeight: number
  model: string
}): string => {
  // Handle case where arguments are already a parsed object (some models via OpenRouter)
  if (typeof argumentsText === 'object' && argumentsText !== null) {
    argumentsText = JSON.stringify(argumentsText)
  }

  const quirks = getQuirks(model)

  // Step 1: Parse JSON (with artifact cleanup only for known models)
  let text = argumentsText
  if (quirks.cleanArtifacts) {
    text = cleanTextArtifacts(text)
  }

  let parsed = extractJson(text)
  if (!parsed && (quirks.cleanArtifacts || quirks.fuzzyFallback)) {
    parsed = fuzzyExtractJson(text)
  }

  if (!parsed || typeof parsed !== 'object') {
    return argumentsText
  }

  // Step 2: Normalize structure (universal) + artifact cleanup (model-specific)
  const normalized = normalizeStructure(parsed, !!quirks.cleanArtifacts)

  // Step 3: Denormalize coordinates (model-specific)
  if (quirks.normalizedCoords && normalized.action && typeof normalized.action === 'object') {
    return JSON.stringify({
      ...normalized,
      action: denormalizeAction(
        normalized.action as Record<string, unknown>,
        displayWidth,
        displayHeight,
      ),
    })
  }

  return JSON.stringify(normalized)
}
