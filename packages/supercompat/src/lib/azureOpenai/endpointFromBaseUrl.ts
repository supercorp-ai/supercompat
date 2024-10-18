export const endpointFromBaseUrl = ({
  baseURL
}: {
  baseURL: string
}) => (
  baseURL.replace(/\/+openai$/, '')
)
