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

    if (regex.test(pathname)) {
      return requestHandlers[key]
    }
  }
}
