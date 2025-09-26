import type { Prisma } from '@prisma/client'

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
  requiredAction?: Prisma.JsonValue | null
  lastError?: Prisma.JsonValue | null
  expiresAt: number
  startedAt?: number | null
  cancelledAt?: number | null
  failedAt?: number | null
  completedAt?: number | null
  model: string
  instructions: string
  tools: Prisma.JsonValue[]
  metadata?: Prisma.JsonValue | null
  usage?: Prisma.JsonValue | null
  truncationStrategy: Prisma.JsonValue
  responseFormat: Prisma.JsonValue
  createdAt: Date
  updatedAt: Date
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
  content: Prisma.JsonValue
  status: MessageStatus
  assistantId?: string
  runId?: string
  completedAt?: Date | null
  incompleteAt?: Date | null
  incompleteDetails?: Prisma.JsonValue | null
  attachments: Prisma.JsonValue[]
  metadata?: Prisma.JsonValue | null
  toolCalls?: Prisma.JsonValue | null
  createdAt: Date
  updatedAt: Date
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
  stepDetails: Prisma.JsonValue
  lastError?: Prisma.JsonValue | null
  expiredAt?: number | null
  cancelledAt?: number | null
  failedAt?: number | null
  completedAt?: number | null
  metadata?: Prisma.JsonValue | null
  usage?: Prisma.JsonValue | null
  createdAt: Date
  updatedAt: Date
}

export type MessageWithRun = Message & {
  run: (Run & {
    runSteps: RunStep[]
  }) | null
}
