type FetchArgs = Parameters<typeof fetch>

export const originalFetch = ({
  args,
  client,
}: {
  args: FetchArgs
  client: any
}) => {
  if (client.client?.fetch) {
    const [url, options = {}] = args

    const headers = {
      ...(options.headers as HeadersInit),
      authorization: client.client.defaultHeaders().Authorization,
    }

    return client.client.fetch(url, {
      ...options,
      headers,
      ...(client.client.httpAgent ? { agent: client.client.httpAgent } : {}),
    })
  }

  return fetch(...args)
}
