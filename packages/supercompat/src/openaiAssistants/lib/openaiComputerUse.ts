type ComputerAction = Record<string, unknown> & {
  type: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isComputerAction = (value: unknown): value is ComputerAction =>
  isRecord(value) && typeof value.type === 'string'

const normalizeEnvironment = ({
  environment,
}: {
  environment: unknown
}) => {
  if (typeof environment !== 'string') return undefined

  const normalized = environment.toLowerCase()

  if (normalized === 'macos') {
    return 'mac'
  }

  return normalized
}

export const isOpenaiComputerUseModel = ({
  model,
}: {
  model: string | null | undefined
}) => {
  if (!model) return false

  const normalized = model.trim().toLowerCase()

  return normalized === 'gpt-5.4' || normalized.startsWith('gpt-5.4-')
}

export const serializeComputerUseTool = ({
  useOpenaiComputerTool,
  tool,
}: {
  useOpenaiComputerTool: boolean
  tool: Record<string, unknown>
}) => {
  const config =
    (isRecord(tool.computer) && tool.computer) ||
    (isRecord(tool.computer_use_preview) && tool.computer_use_preview) ||
    tool

  const serializedConfig: Record<string, unknown> = {}

  if (typeof config.display_width === 'number') {
    serializedConfig.display_width = config.display_width
  }

  if (typeof config.display_height === 'number') {
    serializedConfig.display_height = config.display_height
  }

  const environment = normalizeEnvironment({
    environment: config.environment,
  })

  if (environment) {
    serializedConfig.environment = environment
  }

  if (useOpenaiComputerTool) {
    return {
      type: 'computer' as const,
    }
  }

  return {
    type: 'computer_use_preview' as const,
    ...serializedConfig,
  }
}

export const getComputerCallActions = ({
  item,
}: {
  item: {
    action?: unknown
    actions?: unknown
  }
}): ComputerAction[] => {
  if (Array.isArray(item.actions)) {
    return item.actions.filter(isComputerAction)
  }

  if (isComputerAction(item.action)) {
    return [item.action]
  }

  return []
}

export const serializeCompatComputerCall = ({
  item,
}: {
  item: {
    call_id: string
    pending_safety_checks?: unknown
    action?: unknown
    actions?: unknown
  }
}) => {
  const actions = getComputerCallActions({ item })
  const pendingSafetyChecks = Array.isArray(item.pending_safety_checks)
    ? item.pending_safety_checks
    : []

  return {
    id: item.call_id,
    type: 'computer_call' as const,
    computer_call: {
      ...(actions.length === 1 ? { action: actions[0] } : {}),
      ...(actions.length > 0 ? { actions } : {}),
      pending_safety_checks: pendingSafetyChecks,
    },
  }
}
