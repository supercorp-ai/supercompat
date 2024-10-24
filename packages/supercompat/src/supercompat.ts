import OpenAI, { AzureOpenAI } from 'openai'
import { supercompatFetch, type Args } from './supercompatFetch'
import { endpointFromBaseUrl } from '@/lib/azureOpenai/endpointFromBaseUrl'

export const supercompat = ({
  client,
  storage,
  runAdapter,
}: Args) => {
  if (client.type === 'AZURE_OPENAI') {
    return new AzureOpenAI({
      apiKey: client.client.apiKey,
      apiVersion: client.client.apiVersion,
      endpoint: endpointFromBaseUrl({ baseURL: client.client.baseURL }),
      fetch: supercompatFetch({
        client,
        storage,
        runAdapter,
      }),
    })
  }

  return new OpenAI({
    apiKey: 'SUPERCOMPAT_PLACEHOLDER_OPENAI_KEY',
    fetch: supercompatFetch({
      client,
      storage,
      runAdapter,
    }),
  })
}
