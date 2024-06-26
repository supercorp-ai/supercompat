import { RunAdapter, StorageAdapterArgs } from '@/types'
import { requestHandlers as getRequestHandlers } from './requestHandlers'

const findRequestHandler = ({
  url,
  requestHandlers,
}: {
  url: string
  requestHandlers: any
}) => {
  const pathname = new URL(url).pathname

  for (const key in requestHandlers) {
    const regex = new RegExp(key)

    if (regex.test(pathname)) {
      return requestHandlers[key]
    }
  }
}

export const supercompat = ({
  client,
  storage,
  runAdapter,
}: {
  client: any
  storage: (arg0: StorageAdapterArgs) => any
  runAdapter: RunAdapter
}) => {
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
