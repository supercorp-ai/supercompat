import type Groq from 'groq-sdk'
import { post } from './post'

export const completions = ({
  groq,
}: {
  groq: Groq
}) => ({
  post: post({ groq }),
})
