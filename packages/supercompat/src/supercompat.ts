import OpenAI, { AzureOpenAI } from 'openai'
import { supercompatFetch, type Args } from './supercompatFetch'
import { endpointFromBaseUrl } from './lib/azureOpenai/endpointFromBaseUrl'

export const supercompat = ({
  clientAdapter,
  storageAdapter,
  runAdapter,
}: Args) => {
  if (clientAdapter.type === 'AZURE_OPENAI') {
    return new AzureOpenAI({
      apiKey: clientAdapter.client.apiKey,
      apiVersion: clientAdapter.client.apiVersion,
      endpoint: endpointFromBaseUrl({ baseURL: clientAdapter.client.baseURL }),
      fetch: supercompatFetch({
        clientAdapter,
        storageAdapter,
        runAdapter,
      }),
    })
  }

  return new OpenAI({
    apiKey: 'SUPERCOMPAT_PLACEHOLDER_OPENAI_KEY',
    fetch: supercompatFetch({
      clientAdapter,
      storageAdapter,
      runAdapter,
    }),
  })
}
