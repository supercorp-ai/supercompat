import { test } from 'node:test'
import assert from 'node:assert/strict'
import type OpenAI from 'openai'
import { alternatingMessages } from '../src/lib/messages/alternatingMessages.ts'

test('inserts placeholder messages to alternate roles', () => {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'user', content: 'one' },
    { role: 'user', content: 'two' },
    { role: 'assistant', content: 'hi' },
    { role: 'assistant', content: 'bye' },
  ]

  const result = alternatingMessages({ messages })
  assert.deepEqual(result.map(m => m.role), [
    'user',
    'assistant',
    'user',
    'assistant',
    'user',
    'assistant',
  ])
})
