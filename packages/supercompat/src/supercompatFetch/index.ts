import { RunAdapter, StorageAdapterArgs } from '@/types'
import { requestHandlers as getRequestHandlers } from './requestHandlers'
import { findRequestHandler } from './findRequestHandler'
import { originalFetch } from './originalFetch'

export type Args = {
  clientAdapter: any
  storageAdapter?: (arg0: StorageAdapterArgs) => any
  runAdapter?: RunAdapter
}

export const supercompatFetch = ({
  clientAdapter,
  storageAdapter,
  runAdapter,
}: Args) => {
  const requestHandlers = getRequestHandlers({
    clientAdapter,
    storageAdapter,
    runAdapter,
  })

  return async (...args: any[]) => {
    const [url, options] = args

    const pathHandler = findRequestHandler({
      url,
      requestHandlers,
    })

    if (!pathHandler) {
      return originalFetch({
        clientAdapter,
        args,
      })
    }

    const method = options?.method ?? ''

    const requestHandler = pathHandler[method.toLowerCase()]

    if (!requestHandler) {
      return originalFetch({
        clientAdapter,
        args,
      })
    }

    return requestHandler(...args)
  }
}
