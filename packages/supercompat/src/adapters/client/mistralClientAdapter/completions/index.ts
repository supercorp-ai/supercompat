import type Mistral from '@mistralai/mistralai'
import { post } from './post'

export const completions = ({
  mistral,
}: {
  mistral: Mistral
}) => ({
  post: post({ mistral }),
})
