import OpenAI from 'openai'
import { RunAdapterPartobClient } from '@/types'
import { post } from './post'

export const submitToolOutputs = ({
  openai,
  runAdapter,
}: {
  openai: OpenAI
  runAdapter: RunAdapterPartobClient
}) => ({
  post: post({ openai, runAdapter }),
})
