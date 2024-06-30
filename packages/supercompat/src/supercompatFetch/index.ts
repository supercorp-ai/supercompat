import { RunAdapter, StorageAdapterArgs } from '@/types'
import { requestHandlers as getRequestHandlers } from './requestHandlers'
import { findRequestHandler } from './findRequestHandler'

export type Args = {
  client: any
  storage: (arg0: StorageAdapterArgs) => any
  runAdapter: RunAdapter
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

  return (...args: any[]) => {
    const [url, options] = args

    const pathHandler = findRequestHandler({
      url,
      requestHandlers,
    })

    if (!pathHandler) {
      console.dir({ args, url }, { depth: null })
      // @ts-ignore-next-line
      return fetch(...args)
    }

    const requestHandler = pathHandler[options?.method]

    if (!requestHandler) {
      console.dir({ args, url }, { depth: null })
      // @ts-ignore-next-line
      return fetch(...args)
    }

    return requestHandler(...args)
  }
}
