import type { GoogleGenAI } from '@google/genai'
import { post } from './post'

export const completions = ({
  google,
}: {
  google: GoogleGenAI
}) => ({
  post: post({ google }),
})
