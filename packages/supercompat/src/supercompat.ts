import OpenAI from 'openai'
import { assign, partob } from 'radash'
import { RunAdapter, StorageAdapterArgs } from '@/types'

export const supercompat = ({
  client,
  storage,
  runAdapter,
}: {
  client: OpenAI
  storage: (arg0: StorageAdapterArgs) => OpenAI
  runAdapter: RunAdapter
}) => (
  assign(
    client,
    storage({
      runAdapter: partob(runAdapter, { client }),
    }),
  )
)
