/**
 * OpenAI run adapter for the Responses API surface.
 *
 * Calls OpenAI's native Responses API directly and streams events through.
 * Supports all built-in tools (web_search, file_search, code_interpreter, computer_use).
 */
import type OpenAI from 'openai'

export type ResponsesRunEvent = {
  type: string
  [key: string]: any
}

export type HandleArgs = {
  requestBody: any
  onEvent: (event: ResponsesRunEvent) => Promise<void>
}

export const openaiResponsesRunAdapter = ({
  openai,
}: {
  openai: OpenAI
}) => ({
  type: 'responses-openai' as const,

  handleRun: async ({
    requestBody,
    onEvent,
  }: HandleArgs) => {
    const response = await openai.responses.create({
      ...requestBody,
      stream: true,
    }) as any

    for await (const event of response) {
      await onEvent(event as ResponsesRunEvent)
    }
  },

})
