import { assign, partob } from 'radash'
import { RunAdapter, StorageAdapterArgs } from '@/types'

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
    storage && runAdapter ? (
      storage({
        runAdapter: partob(runAdapter, { client }),
      }).routeHandlers
    ) : {},
  )
)
