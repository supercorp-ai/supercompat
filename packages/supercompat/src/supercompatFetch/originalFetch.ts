export const originalFetch = ({
  args,
  client,
}: {
  args: any[]
  client: any
}) => {
  if (client.client?.fetch) {
    const [url, options] = args

    const headers = {
      ...options.headers,
      authorization: client.client.defaultHeaders().Authorization,
    }

    return client.client.fetch(url, {
      ...options,
      headers,
      ...(client.client.httpAgent ? { agent: client.client.httpAgent } : {}),
    })
  } else {
    // @ts-ignore-next-line
    return fetch(...args)
  }
}
