import OpenAI from 'openai'
import { post } from './post'

export const threads = ({ openai }: { openai: OpenAI }) => ({
  post: post({ openai }),
})
