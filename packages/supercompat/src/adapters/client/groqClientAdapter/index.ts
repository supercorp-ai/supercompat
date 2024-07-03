// import type Groq from 'groq-sdk'
import { completions } from './completions'

export const groqClientAdapter = ({
  groq,
}: {
  // TODO
  groq: any
}) => ({
  client: groq,
  requestHandlers: {
    '^/v1/chat/completions$': completions({ groq }),
  },
})
