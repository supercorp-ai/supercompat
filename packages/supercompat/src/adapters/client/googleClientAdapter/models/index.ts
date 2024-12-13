import type OpenAI from 'openai'
import { get } from './get'

export const models = ({
  google,
}: {
  google: OpenAI
}) => ({
  get: get({ google }),
})
