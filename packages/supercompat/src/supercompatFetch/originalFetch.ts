type FetchArgs = Parameters<typeof fetch>

export const originalFetch = ({
  args,
  client,
}: {
  args: FetchArgs
  client: any
}) => {
  const [url, options = {}] = args

  if (client.client?.apiKey) {
    const headers = {
      ...(options.headers as HeadersInit),
      authorization: `Bearer ${client.client.apiKey}`,
      'openai-beta': 'assistants=v2',
    }

    if (options.body &&
      !(headers as Record<string, string>)['content-type'] &&
      !(headers as Record<string, string>)['Content-Type']) {
      ;(headers as Record<string, string>)['content-type'] = 'application/json'
    }

    return fetch(url, {
      ...options,
      headers,
    })
  }

  return fetch(url, options)
}
