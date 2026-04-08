import { RunAdapter, StorageAdapterArgs } from '@/types'
import { requestHandlers as getRequestHandlers } from './requestHandlers'
import { findRequestHandler } from './findRequestHandler'
import { originalFetch } from './originalFetch'

export type Args = {
  client: any
  storage?: (arg0: StorageAdapterArgs) => any
  runAdapter?: RunAdapter
}

export const supercompatFetch = ({
  client,
  storage,
  runAdapter,
}: Args) => {
  const requestHandlers = getRequestHandlers({
    client,
    storage,
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
        client,
        args,
      })
    }

    const method = options?.method ?? ''

    const requestHandler = pathHandler[method.toLowerCase()]

    if (!requestHandler) {
      return originalFetch({
        client,
        args,
      })
    }

    return requestHandler(...args)
  }
}
