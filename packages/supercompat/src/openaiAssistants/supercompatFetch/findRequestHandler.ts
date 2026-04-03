export const findRequestHandler = ({
  url,
  requestHandlers,
}: {
  url: string
  requestHandlers: any
}) => {
  const pathname = new URL(url).pathname

  for (const key in requestHandlers) {
    const regex = new RegExp(key)
    const matches = regex.test(pathname)

    if (matches) {
      return requestHandlers[key]
    }
  }
}
