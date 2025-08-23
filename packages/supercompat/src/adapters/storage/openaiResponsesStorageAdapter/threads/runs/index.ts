import OpenAI from 'openai'
import { post } from './post'
import { get } from './get'
import { RunAdapterPartobClient } from '@/types'

export const runs = ({
  openai,
  runAdapter,
}: {
  openai: OpenAI
  runAdapter: RunAdapterPartobClient
}) => ({
  post: post({ openai, runAdapter }),
  get: get({ openai }),
})
