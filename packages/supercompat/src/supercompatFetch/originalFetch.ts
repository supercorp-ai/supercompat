export const originalFetch = async ({
  args,
  client,
}: {
  args: any[]
  client: any
}) => {
  if (client.client?.fetch) {
    const [url, options] = args

    const clientHeaders = await client.client.buildHeaders({
      options: {},
      method: args[1].method.toLowerCase(),
      bodyHeaders: args[1].headers,
      retryCount: 0,
    })

    clientHeaders.set('Authorization', `Bearer ${client.client.apiKey}`)

    const newOptions = {
      ...options,
      headers: clientHeaders,
    }

    return client.client.fetch(url, newOptions)
  } else {
    // @ts-ignore-next-line
    return fetch(...args)
  }
}
