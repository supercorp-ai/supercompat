import { get } from './get'
import { post } from './post'
import type { RequestHandler, RunAdapter } from '@/types'

export const assistants = ({
  runAdapter,
}: {
  runAdapter: RunAdapter
}): { post: RequestHandler } => ({
  get: get({ runAdapter }),
  post: post(),
})
