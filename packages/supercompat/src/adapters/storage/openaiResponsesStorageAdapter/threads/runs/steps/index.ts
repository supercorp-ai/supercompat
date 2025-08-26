import OpenAI from 'openai'
import { get } from './get'

export const steps = ({ openai }: { openai: OpenAI }) => ({
  get: get({ openai }),
})

