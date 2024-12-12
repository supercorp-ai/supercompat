import type OpenAI from 'openai'
import { get } from './get'

export const models = ({
  together,
}: {
  together: OpenAI
}) => ({
  get: get({ together }),
})
