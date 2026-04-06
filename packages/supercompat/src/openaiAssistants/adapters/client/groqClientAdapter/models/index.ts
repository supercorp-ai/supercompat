import type Groq from 'groq-sdk'
import { get } from './get'

export const models = ({
  groq,
}: {
  groq: Groq
}) => ({
  get: get({ groq }),
})
