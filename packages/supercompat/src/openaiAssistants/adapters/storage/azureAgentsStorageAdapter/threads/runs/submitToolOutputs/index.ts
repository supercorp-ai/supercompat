import type { AIProjectClient } from '@azure/ai-projects'
import type { PrismaClient } from '@prisma/client'
import { post } from './post'
import type { RequestHandler, RunAdapterWithAssistant } from '@/types'

export const submitToolOutputs = ({
  azureAiProject,
  runAdapter,
  prisma,
}: {
  azureAiProject: AIProjectClient
  runAdapter: RunAdapterWithAssistant
  prisma: PrismaClient
}): { post: RequestHandler } => ({
  post: post({ azureAiProject, runAdapter, prisma }),
})
