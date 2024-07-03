import { assign, partob } from 'radash'
import { RunAdapter, StorageAdapterArgs } from '@/types'

const storageRequestHandlers = ({
  storage,
  runAdapter,
  client,
}: {
  storage?: (arg0: StorageAdapterArgs) => any
  runAdapter?: RunAdapter
  client: any
}) => {
  if (!storage) return {}
  if (!runAdapter) return {}

  const result = storage({ runAdapter: partob(runAdapter, { client }) })
  return result.requestHandlers
}

export const requestHandlers = ({
  client,
  storage,
  runAdapter,
}: {
  client: any
  storage?: (arg0: StorageAdapterArgs) => any
  runAdapter?: RunAdapter
}) => (
  assign(
    client.requestHandlers,
    storageRequestHandlers({
      storage,
      runAdapter,
      client,
    })
  )
)
