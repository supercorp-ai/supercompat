import OpenAI from 'openai'
import { RunAdapter, StorageAdapterArgs } from '@/types'
import { requestHandlers as getRequestHandlers } from './requestHandlers'

const findRequestHandler = ({
  url,
  requestHandlers,
}: {
  url: string
  requestHandlers: any
}) => {
  for (const key in requestHandlers) {
    const regex = new RegExp(key)

    if (regex.test(url)) {
      return requestHandlers[key]
    }
  }
}

export const supercompat = ({
  client,
  storage,
  runAdapter,
}: {
  client: OpenAI
  storage: (arg0: StorageAdapterArgs) => OpenAI
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
