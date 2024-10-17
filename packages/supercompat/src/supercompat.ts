import OpenAI, { AzureOpenAI } from 'openai'
import { supercompatFetch, type Args } from './supercompatFetch'

export const supercompat = ({
  client,
  storage,
  runAdapter,
}: Args) => {
  if (client.client.constructor.name === 'AzureOpenAI') {
    return new AzureOpenAI({
      apiKey: client.client.apiKey,
      apiVersion: client.client.apiVersion,
      baseURL: client.client.baseURL,
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
