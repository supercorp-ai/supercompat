import { test } from 'node:test'
import assert from 'node:assert/strict'
import type OpenAI from 'openai'
import { nonEmptyMessages } from '../src/lib/messages/nonEmptyMessages.ts'

test('replaces empty string content with dash', () => {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'user', content: '   ' },
    { role: 'assistant', content: 'hello' },
  ]

  const result = nonEmptyMessages({ messages })
  assert.equal(result[0].content, '-')
  assert.equal(result[1].content, 'hello')
})
