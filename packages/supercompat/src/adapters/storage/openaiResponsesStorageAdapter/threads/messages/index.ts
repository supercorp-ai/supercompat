import OpenAI from 'openai'
import { post } from './post'
import { list } from './list'

export const messages = ({ openai }: { openai: OpenAI }) => ({
  post: post({ openai }),
  get: list({ openai }),
})
