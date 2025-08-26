import OpenAI from 'openai'
import { get } from './get'

export const run = ({ openai }: { openai: OpenAI }) => ({
  get: get({ openai }),
})
