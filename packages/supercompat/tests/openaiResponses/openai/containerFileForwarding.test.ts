import { describe, test } from 'node:test'
import { strict as assert } from 'node:assert'
import OpenAI from 'openai'
import { openaiClientAdapter, supercompat } from '../../../src/openai/index'

describe('container file forwarding', () => {
  test('supercompat forwards container content retrieval to the provider client', async () => {
    let receivedUrl: string | undefined
    let receivedMethod: string | undefined
    const upstream = new OpenAI({
      apiKey: 'upstream-key',
      baseURL: 'https://provider.example/v1',
      fetch: async (input, init) => {
        receivedUrl = String(input)
        receivedMethod = init?.method
        return new Response(new Uint8Array([4, 5, 6]), {
          headers: { 'Content-Type': 'image/png' },
        })
      },
    })
    const client = supercompat({
      clientAdapter: openaiClientAdapter({ openai: upstream }),
    })

    const response = await client.containers.files.content.retrieve(
      'cfile_xyz',
      { container_id: 'cntr_abc' },
    )

    assert.equal(
      receivedUrl,
      'https://api.openai.com/v1/containers/cntr_abc/files/cfile_xyz/content',
    )
    assert.equal(receivedMethod, 'GET')
    assert.equal(response.headers.get('Content-Type'), 'image/png')
    assert.deepEqual(
      Array.from(new Uint8Array(await response.arrayBuffer())),
      [4, 5, 6],
    )
  })
})
