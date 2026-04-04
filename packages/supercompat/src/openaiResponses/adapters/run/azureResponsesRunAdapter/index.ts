/**
 * Azure Responses run adapter for the Responses API surface.
 *
 * Calls Azure's native Responses API directly and streams events through.
 * Uses AIProjectClient.getOpenAIClient() to obtain an authenticated OpenAI client.
 */
import type OpenAI from 'openai'
import type { AIProjectClient } from '@azure/ai-projects'

export type ResponsesRunEvent = {
  type: string
  [key: string]: any
}

export type HandleArgs = {
  requestBody: any
  onEvent: (event: ResponsesRunEvent) => Promise<void>
}

export const azureResponsesRunAdapter = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}) => ({
  type: 'responses-azure' as const,

  handleResponsesRun: async ({
    requestBody,
    onEvent,
  }: HandleArgs) => {
    const client: OpenAI = await (azureAiProject as any).getOpenAIClient()

    const response = await client.responses.create({
      ...requestBody,
      stream: true,
    }) as any

    for await (const event of response) {
      await onEvent(event as ResponsesRunEvent)
    }
  },

  handleRun: async () => {
    throw new Error('azureResponsesRunAdapter does not support Assistants-style handleRun. Use handleResponsesRun instead.')
  },
})
