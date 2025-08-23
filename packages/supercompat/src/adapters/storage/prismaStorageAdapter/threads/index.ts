import type { PrismaClient } from '@prisma/client'
import { post } from './post'

export const threads = ({
  prisma,
}: {
  prisma: PrismaClient
}) => ({
  post: post({ prisma }),
}) as { post: (url: string, options: any) => Promise<Response> }
