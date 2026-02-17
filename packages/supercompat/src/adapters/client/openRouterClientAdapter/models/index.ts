import type OpenAI from 'openai'
import { get } from './get'

export const models = ({
  openRouter,
}: {
  openRouter: OpenAI
}) => ({
  get: get({ openRouter }),
})
