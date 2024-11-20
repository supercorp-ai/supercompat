import type OpenAI from 'openai'

const serializeMessage = ({
  message: {
    // @ts-ignore-next-line
    tool_calls,
    // @ts-ignore-next-line
    tool_call_id,
    ...rest
  },
}: {
  message: OpenAI.ChatCompletionMessageParam
}) => ({
  ...rest,
  ...(tool_call_id ? {
    toolCallId: tool_call_id,
  } : {}),
  ...(tool_calls ? {
    toolCalls: tool_calls,
  } : {}),
})

export const serializeBody = ({
  body,
}: {
  body: any
}) => ({
  ...body,
  messages: body.messages.map((message: OpenAI.ChatCompletionMessageParam) => (
    serializeMessage({
      message,
    })
  )),
})
