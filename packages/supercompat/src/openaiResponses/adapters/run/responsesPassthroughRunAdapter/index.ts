/**
 * Pass-through run adapter for the Responses API surface.
 *
 * Instead of going through Chat Completions, this adapter calls
 * client.responses.create() directly and streams native Responses events.
 * Use with providers that have a native Responses API (OpenAI, Azure).
 *
 * Usage:
 *   import { responsesPassthroughRunAdapter } from 'supercompat/openaiResponses'
 *   supercompat({
 *     client: openaiClientAdapter({ openai }),
 *     runAdapter: responsesPassthroughRunAdapter(),
 *     storage: prismaStorageAdapter({ prisma }),
 *   })
 */
import type OpenAI from 'openai'

export type ResponsesRunEvent = {
  type: string
  [key: string]: any
}

export type ResponsesRunAdapterHandleArgs = {
  client: OpenAI
  requestBody: OpenAI.Responses.ResponseCreateParams
  onEvent: (event: ResponsesRunEvent) => Promise<void>
}

export const responsesPassthroughRunAdapter = ({
  openai,
  getClient,
}: {
  openai?: OpenAI
  getClient?: () => Promise<OpenAI>
}) => ({
  type: 'responses-passthrough' as const,

  handleResponsesRun: async ({
    requestBody,
    onEvent,
  }: Omit<ResponsesRunAdapterHandleArgs, 'client'>) => {
    const client = openai ?? await getClient?.()
    if (!client) throw new Error('responsesPassthroughRunAdapter: no client provided')

    const response = await client.responses.create({
      ...requestBody,
      stream: true,
    })

    for await (const event of response) {
      await onEvent(event as ResponsesRunEvent)
    }
  },

  // Stub for compatibility with the Assistants run adapter interface
  handleRun: async () => {
    throw new Error('responsesPassthroughRunAdapter does not support Assistants-style handleRun. Use handleResponsesRun instead.')
  },
})
