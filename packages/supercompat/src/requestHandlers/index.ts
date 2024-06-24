import OpenAI from 'openai'
import { RunAdapter, StorageAdapterArgs } from '@/types'
import { assign, partob } from 'radash'

export const requestHandlers = ({
  client,
  storage,
  runAdapter,
}: {
  client: OpenAI
  storage: (arg0: StorageAdapterArgs) => OpenAI
  runAdapter: RunAdapter
}) => {
  return assign(
    client,
    storage({
      runAdapter: partob(runAdapter, { client }),
    }),
  )
}
