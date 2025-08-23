export const originalFetch = ({
  args,
  client,
}: {
  args: any[]
  client: any
}) => {
  if (client.client?.fetch) {
    const [url, options] = args

    const headersInit = options?.headers as HeadersInit
    const requestHeaders =
      headersInit instanceof Headers
        ? Object.fromEntries(headersInit.entries())
        : headersInit

    const headers = {
      ...(requestHeaders as Record<string, string>),
      authorization: client.client.defaultHeaders().Authorization,
    }

    return client.client.fetch(url, {
      ...options,
      headers,
    })
  } else {
    // @ts-ignore-next-line
    return fetch(...args)
  }
}
