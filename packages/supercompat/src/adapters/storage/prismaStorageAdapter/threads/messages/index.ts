import type { PrismaClient } from '@prisma/client'
import { post } from './post'
import { get } from './get'

export const messages = ({
  prisma,
}: {
  prisma: PrismaClient
}) => ({
  post: post({ prisma }),
  get: get({ prisma }),
})
