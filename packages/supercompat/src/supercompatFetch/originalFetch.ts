export const originalFetch = ({
  args,
  client,
}: {
  args: any[]
  client: any
}) => {
  if (client.client) {
    const [url, options] = args

    const headers = {
      ...options.headers,
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
