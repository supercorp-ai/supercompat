import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import {
  supercompat,
  anthropicClientAdapter,
  openaiResponsesStorageAdapter,
  completionsRunAdapter,
} from '../src/index'

test('submitToolOutputs requires thread_id in params', async () => {
  const client = supercompat({
    client: anthropicClientAdapter({ anthropic: new Anthropic({ apiKey: 'test' }) }),
    storage: openaiResponsesStorageAdapter({ openai: new OpenAI({ apiKey: process.env.TEST_OPENAI_API_KEY }) }),
    runAdapter: completionsRunAdapter(),
  })

  await assert.rejects(
    async () =>
      client.beta.threads.runs.submitToolOutputs('run-id', {
        stream: true,
        tool_outputs: [],
      }),
    /invalid segments/
  )
})
