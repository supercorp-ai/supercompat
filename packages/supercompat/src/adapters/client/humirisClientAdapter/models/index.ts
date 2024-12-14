import type OpenAI from 'openai'
import { get } from './get'

export const models = ({
  humiris,
}: {
  humiris: OpenAI
}) => ({
  get: get({ humiris }),
})
