import type { PrismaClient } from '@prisma/client'
import { RunAdapter } from '@/types'
import { list } from './list'
import { retrieve } from './retrieve'
import { create } from './create'
import { createAndStream } from './createAndStream'
import { submitToolOutputs } from './submitToolOutputs'
import { submitToolOutputsStream } from './submitToolOutputsStream'
import { steps } from './steps'

export const runs = ({
  prisma,
  runAdapter,
}: {
  prisma: PrismaClient
  runAdapter: RunAdapter
}) => ({
  list: list({ prisma }),
  retrieve: retrieve({ prisma }),
  create: create({ prisma, runAdapter }),
  createAndStream: createAndStream({ prisma, runAdapter }),
  submitToolOutputs: submitToolOutputs({ prisma, runAdapter }),
  submitToolOutputsStream: submitToolOutputsStream({ prisma, runAdapter }),
  steps: steps({ prisma }),
})
