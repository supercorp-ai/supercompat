import { test } from 'node:test'
import assert from 'node:assert/strict'
import type OpenAI from 'openai'
import { firstUserMessages } from '../src/lib/messages/firstUserMessages.ts'

test('adds placeholder when first message is not user', () => {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'assistant', content: 'Hi' },
    { role: 'user', content: 'Hello' },
  ]
  const result = firstUserMessages({ messages })
  assert.equal(result[0].role, 'user')
  assert.equal(result[0].content, '-')
  assert.equal(result[1].role, 'assistant')
  assert.equal(result[2].role, 'user')
})

