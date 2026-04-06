import { post } from './post'
import type { RequestHandler, RunAdapterWithAssistant } from '@/types'

export const assistants = ({
  runAdapter,
}: {
  runAdapter: RunAdapterWithAssistant
}): { post: RequestHandler } => ({
  post: post({ runAdapter }),
})
