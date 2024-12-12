import type { Mistral } from '@mistralai/mistralai'
import { get } from './get'

export const models = ({
  mistral,
}: {
  mistral: Mistral
}) => ({
  get: get({ mistral }),
})
