import type { PrismaClient } from '@prisma/client'
import { post } from './post'

export const assistants = ({ prisma }: { prisma: PrismaClient }) => ({
  post: post({ prisma }),
})
