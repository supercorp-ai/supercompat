import type OpenAI from 'openai'
import { serializeMessage } from './serializeMessage'

export const serializeMessages = ({
  messages,
}: {
  messages: OpenAI.ChatCompletionMessageParam[]
}) => (
  messages.map(message => (
    serializeMessage({
      message,
    })
  ))
)
