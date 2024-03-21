export enum RunStatus {
  QUEUED = "QUEUED",
  IN_PROGRESS = "IN_PROGRESS",
  REQUIRES_ACTION = "REQUIRES_ACTION",
  CANCELLING = "CANCELLING",
  CANCELLED = "CANCELLED",
  FAILED = "FAILED",
  COMPLETED = "COMPLETED",
  EXPIRED = "EXPIRED",
}

export type Run = {
  id: string
  threadId: string
  assistantId: string
  status: RunStatus
  requiredAction?: JSON
  lastError?: JSON
  expiresAt: number
  startedAt?: number
  cancelledAt?: number
  failedAt?: number
  completedAt?: number
  model: string
  instructions: string
  tools: JSON[]
  fileIds: string[]
  metadata?: JSON
  usage?: JSON
  createdAt: string
  updatedAt: string
}

export enum MessageRole {
  USER = "USER",
  ASSISTANT = "ASSISTANT",
}

export enum MessageStatus {
  IN_PROGRESS = "IN_PROGRESS",
  INCOMPLETE = "INCOMPLETE",
  COMPLETED = "COMPLETED",
}

export type Message = {
  id: string
  threadId: string
  role: MessageRole
  content: JSON[]
  status: MessageStatus
  assistantId?: string
  runId?: string
  completedAt?: string
  incompleteAt?: string
  incompleteDetails?: JSON
  fileIds: string[]
  metadata?: JSON
  toolCalls?: JSON
  createdAt: string
  updatedAt: string
}

export enum RunStepType {
  MESSAGE_CREATION = "MESSAGE_CREATION",
  TOOL_CALLS = "TOOL_CALLS",
}

export enum RunStepStatus {
  IN_PROGRESS = "IN_PROGRESS",
  CANCELLED = "CANCELLED",
  FAILED = "FAILED",
  COMPLETED = "COMPLETED",
  EXPIRED = "EXPIRED",
}

export type RunStep = {
  id: string
  threadId: string
  assistantId: string
  runId: string
  type: RunStepType
  status: RunStepStatus
  stepDetails: JSON
  lastError?: JSON
  expiredAt?: number
  cancelledAt?: number
  failedAt?: number
  completedAt?: number
  metadata?: JSON
  usage?: JSON
  createdAt: string
  updatedAt: string
}

export type MessageWithRun = Message & {
  run: (Run & {
    runSteps: RunStep[]
  }) | null
}
