import { assign, partob } from 'radash'
import { RunAdapter, StorageAdapterArgs } from '@/types'
import { supercompat } from '@/supercompat'

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

  const wrappedClient = supercompat({
    client,
  })

  const result = storage({
    runAdapter: {
      ...runAdapter,
      handleRun: partob(runAdapter.handleRun, { client: wrappedClient }),
    },
    client: wrappedClient,
  })
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
