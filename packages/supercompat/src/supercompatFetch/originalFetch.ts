export const originalFetch = async ({
  args,
  clientAdapter,
}: {
  args: any[]
  clientAdapter: any
}) => {
  if (clientAdapter.client?.fetch) {
    const [url, options] = args

    const clientHeaders = await clientAdapter.client.buildHeaders({
      options: {},
      method: args[1].method.toLowerCase(),
      bodyHeaders: args[1].headers,
      retryCount: 0,
    })

    clientHeaders.set('Authorization', `Bearer ${clientAdapter.client.apiKey}`)

    const newOptions = {
      ...options,
      headers: clientHeaders,
    }

    return clientAdapter.client.fetch(url, newOptions)
  } else {
    // @ts-ignore-next-line
    return fetch(...args)
  }
}
