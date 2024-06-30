import type { PrismaClient } from '@prisma/client'
import { StorageAdapterArgs } from '@/types'
import { threads } from './threads'
import { messages } from './threads/messages'
import { runs } from './threads/runs'
import { run } from './threads/run'
import { steps } from './threads/runs/steps'
import { submitToolOutputs } from './threads/runs/submitToolOutputs'

export const prismaStorageAdapter = ({
  prisma,
}: {
  prisma: PrismaClient
}) => ({
  runAdapter,
}: StorageAdapterArgs) => ({
  '^/v1/threads$': threads({ prisma }),
  '^/v1/threads/([^/]+)/messages$': messages({ prisma }),
  '^/v1/threads/([^/]+)/runs$': runs({ prisma, runAdapter }),
  '^/v1/threads/([^/]+)/runs/([^/]+)$': run({ prisma, runAdapter }),
  '^/v1/threads/([^/]+)/runs/([^/]+)/steps$': steps({ prisma }),
  '^/v1/threads/([^/]+)/runs/([^/]+)/submit_tool_outputs$': submitToolOutputs({ prisma, runAdapter }),
})
