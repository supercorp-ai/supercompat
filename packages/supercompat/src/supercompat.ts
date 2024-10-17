import OpenAI, { AzureOpenAI } from 'openai'
import { supercompatFetch, type Args } from './supercompatFetch'

export const supercompat = ({
  client,
  storage,
  runAdapter,
}: Args) => {
  if (client.client.constructor.name === 'AzureOpenAI') {
    console.log({ client })
    return new AzureOpenAI({
      apiKey: client.client.apiKey,
      apiVersion: client.client.apiVersion,
      endpoint: 'https://ai-domasaiuksouth776179364551.openai.azure.com/',
      // endpoint: client.client.baseURL,
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
