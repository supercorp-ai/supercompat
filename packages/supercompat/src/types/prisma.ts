import type { Run, Message, RunStep } from '@prisma/client'

export type { Run, Message, RunStep } from '@prisma/client'

export {
  RunStatus,
  MessageRole,
  MessageStatus,
  RunStepType,
  RunStepStatus,
} from '@prisma/client'

export type MessageWithRun = Message & {
  run: (Run & { runSteps: RunStep[] }) | null
}
