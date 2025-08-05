import { test } from 'node:test'
import assert from 'node:assert/strict'
import type OpenAI from 'openai'
import { alternatingMessages } from '../src/lib/messages/alternatingMessages.ts'
import { firstUserMessages } from '../src/lib/messages/firstUserMessages.ts'
import { nonEmptyMessages } from '../src/lib/messages/nonEmptyMessages.ts'

const pipeline = (messages: OpenAI.Chat.ChatCompletionMessageParam[]) =>
  nonEmptyMessages({
    messages: firstUserMessages({
      messages: alternatingMessages({ messages })
    })
  })

test('combines message utilities end to end', () => {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: '' },
    { role: 'user', content: 'Hello' },
    { role: 'user', content: 'How are you?' }
  ]

  const result = pipeline(messages)

  assert.deepEqual(result.map(m => m.role), [
    'user',
    'system',
    'user',
    'assistant',
    'user'
  ])
  assert.ok(result.every(m => typeof m.content === 'string' && m.content.trim() !== ''))
})
