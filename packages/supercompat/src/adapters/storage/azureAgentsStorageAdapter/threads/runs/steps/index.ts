import type { AIProjectClient } from '@azure/ai-projects'
import type { PrismaClient } from '@prisma/client'
import { get } from './get'
import type { RequestHandler, RunAdapterWithAssistant } from '@/types'

export const steps = ({
  azureAiProject,
  runAdapter,
  prisma,
}: {
  azureAiProject: AIProjectClient
  runAdapter: RunAdapterWithAssistant
  prisma: PrismaClient
}): { get: RequestHandler } => ({
  get: get({ azureAiProject, runAdapter, prisma }),
})
