import type { AIProjectClient } from '@azure/ai-projects'
import type { PrismaClient } from '@prisma/client'
import { get } from './get'
import type { RequestHandler } from '@/types'

export const step = ({
  azureAiProject,
  prisma,
}: {
  azureAiProject: AIProjectClient
  prisma: PrismaClient
}): { get: RequestHandler } => ({
  get: get({ azureAiProject, prisma }),
})
