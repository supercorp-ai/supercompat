import { assign, partob } from 'radash'
import { RunAdapter, StorageAdapterArgs } from '@/types'
import { supercompat } from '@/supercompat'

const storageRequestHandlers = ({
  storageAdapter,
  runAdapter,
  clientAdapter,
}: {
  storageAdapter?: (arg0: StorageAdapterArgs) => any
  runAdapter?: RunAdapter
  clientAdapter: any
}) => {
  if (!storageAdapter) return {}
  if (!runAdapter) return {}

  const wrappedClient = supercompat({
    clientAdapter,
  })

  const result = storageAdapter({
    runAdapter: {
      ...runAdapter,
      handleRun: partob(runAdapter.handleRun, { client: wrappedClient }),
    },
    client: wrappedClient,
    originalClientAdapter: clientAdapter,
  })
  return result.requestHandlers
}

export const requestHandlers = ({
  clientAdapter,
  storageAdapter,
  runAdapter,
}: {
  clientAdapter: any
  storageAdapter?: (arg0: StorageAdapterArgs) => any
  runAdapter?: RunAdapter
}) => (
  assign(
    clientAdapter.requestHandlers,
    storageRequestHandlers({
      storageAdapter,
      runAdapter,
      clientAdapter,
    })
  )
)
