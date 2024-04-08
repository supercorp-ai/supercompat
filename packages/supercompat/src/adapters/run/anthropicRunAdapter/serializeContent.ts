export const serializeContent = ({
  providerResponse
}: {
  providerResponse: any
}) => {
  if (!providerResponse.content) {
    return []
  }

  return providerResponse.content.filter((c: any) => c.type === 'text').map((c: any) => ({
    type: 'text',
    text: {
      value: c.text,
      annotations: [],
    },
  }))
}
