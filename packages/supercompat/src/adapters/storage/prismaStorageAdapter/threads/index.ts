import type { PrismaClient } from '@prisma/client'
import { post } from './post'

export const threads = ({
  prisma,
}: {
  prisma: PrismaClient
}) => ({
  post: post({ prisma }),
})
