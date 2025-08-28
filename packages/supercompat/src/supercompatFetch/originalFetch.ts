export const originalFetch = ({
  args,
  client,
}: {
  args: any[]
  client: any
}) => {
  if (client.client?.fetch) {
    const [url, options] = args
    const h = new Headers(options?.headers as any)
    const auth = h.get('Authorization')
    if (!auth || auth.includes('SUPERCOMPAT_PLACEHOLDER')) {
      h.set('Authorization', `Bearer ${client.client.apiKey}`)
    }
    return client.client.fetch(url, { ...options, headers: h })
  } else {
    // @ts-ignore-next-line
    return fetch(...args)
  }
}
