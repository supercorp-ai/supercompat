import type { GoogleGenAI } from '@google/genai'
import { get } from './get'

export const models = ({
  google,
}: {
  google: GoogleGenAI
}) => ({
  get: get({ google }),
})
