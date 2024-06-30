import OpenAI from 'openai'
import { supercompatFetch, type Args } from './supercompatFetch'

export const supercompat = ({
  client,
  storage,
  runAdapter,
}: Args) => (
  new OpenAI({
    apiKey: 'SUPERCOMPAT_PLACEHOLDER_OPENAI_KEY',
    fetch: supercompatFetch({
      client,
      storage,
      runAdapter,
    }),
  })
)
