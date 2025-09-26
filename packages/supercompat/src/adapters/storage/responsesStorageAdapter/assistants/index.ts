import { get } from './get'
import { post } from './post'
import type { RequestHandler, RunAdapterWithAssistant } from '@/types'

export const assistants = ({
  runAdapter,
}: {
  runAdapter: RunAdapterWithAssistant
}): { get: RequestHandler, post: RequestHandler } => ({
  get: get({ runAdapter }),
  post: post(),
})
