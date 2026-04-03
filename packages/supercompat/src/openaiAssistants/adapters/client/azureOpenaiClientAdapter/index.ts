import type { AzureOpenAI } from 'openai'
import { completions } from '@/adapters/client/openaiClientAdapter/completions'

export const azureOpenaiClientAdapter = ({
  azureOpenai,
}: {
  azureOpenai: AzureOpenAI
}) => ({
  type: 'AZURE_OPENAI',
  client: azureOpenai,
  requestHandlers: {
    '^/(?:v1|/?openai)/chat/completions$': completions({
      openai: azureOpenai,
    }),
  },
})
