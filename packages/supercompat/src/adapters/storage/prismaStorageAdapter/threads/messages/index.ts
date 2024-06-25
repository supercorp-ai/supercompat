import type { PrismaClient } from '@prisma/client'
import { post } from './post'

export const messages = ({
  prisma,
}: {
  prisma: PrismaClient
}) => ({
  post: post({ prisma }),
})
