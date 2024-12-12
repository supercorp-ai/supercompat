import type OpenAI from 'openai'
import { get } from './get'

export const models = ({
  openai,
}: {
  openai: OpenAI
}) => ({
  get: get({ openai }),
})
