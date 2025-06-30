import { test } from 'node:test'
import assert from 'node:assert/strict'
import type OpenAI from 'openai'
import { systemDeveloperMessages } from '../src/lib/messages/systemDeveloperMessages.ts'

test('converts system role to user for o-models', () => {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: 'setup' },
    { role: 'user', content: 'hi' }
  ]

  const result = systemDeveloperMessages({ messages, model: 'o1-mini' })

  assert.equal(result[0].role, 'user')
})

test('keeps system role for non o-models', () => {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: 'setup' },
    { role: 'user', content: 'hi' }
  ]

  const result = systemDeveloperMessages({ messages, model: 'gpt-3.5-turbo' })

  assert.equal(result[0].role, 'system')
})
