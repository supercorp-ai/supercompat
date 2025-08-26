const toRecord = (init: HeadersInit = {}) => {
  if (init instanceof Headers) return Object.fromEntries(init.entries())

  return Object.keys(init).reduce(
    (acc, key) => ({
      ...acc,
      [key.toLowerCase()]: (init as any)[key],
    }),
    {} as Record<string, string>
  )
}

const getClientHeaders = async (client: any) => {
  if (typeof client.client.authHeaders === 'function') {
    return client.client.authHeaders()
  }
  if (typeof client.client.defaultHeaders === 'function') {
    return client.client.defaultHeaders()
  }
  return {}
}

const normalize = (headersInit: any) => {
  if (!headersInit) return {}
  if (headersInit instanceof Headers) {
    return Object.fromEntries(headersInit.entries())
  }
  if (headersInit?.values instanceof Headers) {
    return Object.fromEntries(headersInit.values.entries())
  }
  return Object.fromEntries(new Headers(headersInit as HeadersInit).entries())
}

export const originalFetch = async ({
  args,
  client,
}: {
  args: any[]
  client: any
}) => {
  if (!client.client?.fetch) {
    // @ts-ignore-next-line
    return fetch(...args)
  }

  const [url, options] = args
  const requestHeaders = toRecord(options?.headers as HeadersInit)
  const clientHeaders = normalize(await getClientHeaders(client))
  const headers = { ...requestHeaders, ...clientHeaders }

  return client.client.fetch(url, {
    ...options,
    headers,
  })
}
