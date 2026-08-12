/**
 * Unit + integration tests for `backfillContainerFileAnnotations`.
 *
 * The helper restores `container_file_citation` annotations on assistant
 * messages whose text contains `sandbox:/mnt/data/...` URLs but no matching
 * annotations — the case OpenAI's Responses API leaves orphaned on follow-up
 * turns where the model doesn't actively invoke code_interpreter.
 *
 * Unit tests stub `listFiles` so they're hermetic. The integration test
 * exercises a real OpenAI multi-turn conversation end-to-end (generates files
 * with code_interpreter on turn 1, references them on turn 2, then verifies
 * the backfill recovers the missing annotations).
 */
import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import OpenAI from 'openai'
import dayjs from 'dayjs'
import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { HttpsProxyAgent } from 'https-proxy-agent'
import {
  backfillContainerFileAnnotations,
  findActiveContainerId,
  findOrphanSandboxOccurrences,
} from '../../../src/lib/items/backfillContainerFileAnnotations'
import { serializeItemAsMessage } from '../../../src/lib/items/serializeItemAsMessage'
import {
  openaiResponsesRunAdapter,
  openaiClientAdapter,
  supercompat,
  openaiResponsesStorageAdapter,
} from '../../../src/openai/index'

const apiKey = process.env.TEST_OPENAI_API_KEY

if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY))
}

const makeMessageItem = ({
  id,
  text,
  annotations = [],
}: {
  id: string
  text: string
  annotations?: any[]
}) => ({
  id,
  type: 'message' as const,
  role: 'assistant' as const,
  status: 'completed' as const,
  content: [
    {
      type: 'output_text' as const,
      text,
      annotations,
    },
  ],
})

const makeCodeCallItem = ({
  id,
  containerId,
  createdAt = 0,
}: {
  id: string
  containerId: string
  createdAt?: number
}) => ({
  id,
  type: 'code_interpreter_call' as const,
  status: 'completed' as const,
  container_id: containerId,
  created_at: createdAt,
})

describe('findOrphanSandboxOccurrences', () => {
  test('returns zero occurrences when text has no sandbox URLs', () => {
    const occ = findOrphanSandboxOccurrences({
      text: 'no files here, just words',
      annotations: [],
    })
    assert.equal(occ.length, 0)
  })

  test('returns each sandbox URL when none are annotated', () => {
    const text =
      '- [a](sandbox:/mnt/data/a.txt)\n- [b](sandbox:/mnt/data/b.txt)'
    const occ = findOrphanSandboxOccurrences({ text, annotations: [] })
    assert.equal(occ.length, 2)
    assert.equal(occ[0].path, '/mnt/data/a.txt')
    assert.equal(occ[1].path, '/mnt/data/b.txt')
    assert.equal(
      text.slice(occ[0].start, occ[0].end),
      'sandbox:/mnt/data/a.txt',
    )
  })

  test('skips URLs already covered by a container_file_citation annotation', () => {
    const text =
      'See [a](sandbox:/mnt/data/a.txt) and [b](sandbox:/mnt/data/b.txt).'
    // Cover only the first sandbox URL.
    const aStart = text.indexOf('sandbox:/mnt/data/a.txt')
    const aEnd = aStart + 'sandbox:/mnt/data/a.txt'.length
    const occ = findOrphanSandboxOccurrences({
      text,
      annotations: [
        {
          type: 'container_file_citation',
          start_index: aStart,
          end_index: aEnd,
        },
      ],
    })
    assert.equal(occ.length, 1)
    assert.equal(occ[0].path, '/mnt/data/b.txt')
  })

  test('skips URLs already covered by a file_path annotation (post-mapping)', () => {
    const text = '[a](sandbox:/mnt/data/a.txt)'
    const start = text.indexOf('sandbox:')
    const end = start + 'sandbox:/mnt/data/a.txt'.length
    const occ = findOrphanSandboxOccurrences({
      text,
      annotations: [
        {
          type: 'file_path',
          start_index: start,
          end_index: end,
        },
      ],
    })
    assert.equal(occ.length, 0)
  })

  test('ignores annotations of unrelated types', () => {
    const text = '[a](sandbox:/mnt/data/a.txt)'
    const start = text.indexOf('sandbox:')
    const end = start + 'sandbox:/mnt/data/a.txt'.length
    const occ = findOrphanSandboxOccurrences({
      text,
      annotations: [
        { type: 'url_citation', start_index: start, end_index: end },
      ],
    })
    assert.equal(occ.length, 1)
  })

  test('finds sandbox URLs in Markdown images', () => {
    const text = '![Chart](sandbox:/mnt/data/chart.png)'
    const occ = findOrphanSandboxOccurrences({ text, annotations: [] })
    assert.equal(occ.length, 1)
    assert.equal(occ[0].path, '/mnt/data/chart.png')
  })

  test('stops at quotes and angle brackets in literal image tags', () => {
    const text = '<img src="sandbox:/mnt/data/chart.png" alt="Chart">'
    const occ = findOrphanSandboxOccurrences({ text, annotations: [] })
    assert.equal(occ.length, 1)
    assert.equal(occ[0].path, '/mnt/data/chart.png')
    assert.equal(occ[0].url, 'sandbox:/mnt/data/chart.png')
  })
})

describe('findActiveContainerId', () => {
  test('returns null when there are no code_interpreter_call items', () => {
    const items = [makeMessageItem({ id: 'm1', text: 'hi' })] as any
    assert.equal(findActiveContainerId({ items }), null)
  })

  test('returns the container_id of the most recent code_interpreter_call', () => {
    const items = [
      makeCodeCallItem({ id: 'ci1', containerId: 'cntr_old', createdAt: 100 }),
      makeMessageItem({ id: 'm1', text: 'hi' }),
      makeCodeCallItem({ id: 'ci2', containerId: 'cntr_new', createdAt: 200 }),
    ] as any
    assert.equal(findActiveContainerId({ items }), 'cntr_new')
  })

  test('falls back to array position when created_at is missing', () => {
    const items = [
      makeCodeCallItem({ id: 'ci1', containerId: 'cntr_a' }),
      makeCodeCallItem({ id: 'ci2', containerId: 'cntr_b' }),
    ] as any
    // ci2 is later in the array, so it wins on the tiebreak.
    assert.equal(findActiveContainerId({ items }), 'cntr_b')
  })

  test('skips code_interpreter_call items lacking container_id', () => {
    const items = [
      { id: 'ci1', type: 'code_interpreter_call' },
      makeCodeCallItem({ id: 'ci2', containerId: 'cntr_real' }),
    ] as any
    assert.equal(findActiveContainerId({ items }), 'cntr_real')
  })

  test('falls back to container_file_citation when the code call is outside the page', () => {
    const items = [
      makeMessageItem({
        id: 'm1',
        text: '[old](sandbox:/mnt/data/old.txt)',
        annotations: [
          {
            type: 'container_file_citation',
            container_id: 'cntr_from_annotation',
            file_id: 'cfile_old',
            start_index: 6,
            end_index: 37,
          },
        ],
      }),
    ] as any
    assert.equal(findActiveContainerId({ items }), 'cntr_from_annotation')
  })

  test('recognizes the additive file_path.container_id shape', () => {
    const items = [
      makeMessageItem({
        id: 'm1',
        text: '[old](sandbox:/mnt/data/old.txt)',
        annotations: [
          {
            type: 'file_path',
            file_path: {
              file_id: 'cfile_old',
              container_id: 'cntr_from_file_path',
            },
            start_index: 6,
            end_index: 37,
          },
        ],
      }),
    ] as any
    assert.equal(findActiveContainerId({ items }), 'cntr_from_file_path')
  })
})

describe('backfillContainerFileAnnotations', () => {
  test('no-ops (and no listFiles call) when no sandbox URLs are present', async () => {
    const items: any[] = [makeMessageItem({ id: 'm1', text: 'plain text' })]
    let listCalls = 0
    const injected = await backfillContainerFileAnnotations({
      client: {} as OpenAI,
      items,
      listFiles: async () => {
        listCalls += 1
        return []
      },
    })
    assert.equal(injected, 0)
    assert.equal(
      listCalls,
      0,
      'listFiles must not be called when nothing to backfill',
    )
  })

  test('no-ops (and no listFiles call) when every URL is already annotated', async () => {
    const text = '[a](sandbox:/mnt/data/a.txt)'
    const start = text.indexOf('sandbox:')
    const end = start + 'sandbox:/mnt/data/a.txt'.length
    const items: any[] = [
      makeMessageItem({
        id: 'm1',
        text,
        annotations: [
          {
            type: 'container_file_citation',
            text: '',
            start_index: start,
            end_index: end,
            file_id: 'cfile_existing',
            container_id: 'cntr_existing',
          },
        ],
      }),
      makeCodeCallItem({ id: 'ci1', containerId: 'cntr_existing' }),
    ]
    let listCalls = 0
    const injected = await backfillContainerFileAnnotations({
      client: {} as OpenAI,
      items,
      listFiles: async () => {
        listCalls += 1
        return []
      },
    })
    assert.equal(injected, 0)
    assert.equal(listCalls, 0)
  })

  test('no-ops when sandbox URLs exist but the conversation never used code_interpreter', async () => {
    // Edge case: another tool (or a model hallucination) produced a
    // sandbox-shaped URL but there's no container to look it up against.
    const items: any[] = [
      makeMessageItem({ id: 'm1', text: '[a](sandbox:/mnt/data/a.txt)' }),
    ]
    let listCalls = 0
    const injected = await backfillContainerFileAnnotations({
      client: {} as OpenAI,
      items,
      listFiles: async () => {
        listCalls += 1
        return []
      },
    })
    assert.equal(injected, 0)
    assert.equal(listCalls, 0)
  })

  test('injects synthetic container_file_citation for each orphan URL with a path match', async () => {
    const text =
      'Here are the files:\n' +
      '- [a](sandbox:/mnt/data/a.txt)\n' +
      '- [b](sandbox:/mnt/data/b.txt)\n' +
      '- [missing](sandbox:/mnt/data/never-existed.txt)'
    const items: any[] = [
      makeCodeCallItem({ id: 'ci1', containerId: 'cntr_xyz', createdAt: 100 }),
      makeMessageItem({ id: 'm1', text }),
    ]

    let listCalls = 0
    const injected = await backfillContainerFileAnnotations({
      client: {} as OpenAI,
      items,
      listFiles: async ({ containerId }: { containerId: string }) => {
        listCalls += 1
        assert.equal(
          containerId,
          'cntr_xyz',
          'should look up the active container',
        )
        return [
          { id: 'cfile_a', path: '/mnt/data/a.txt' },
          { id: 'cfile_b', path: '/mnt/data/b.txt' },
        ]
      },
    })

    // Only files that exist in the container get backfilled. The third URL
    // ("never-existed.txt") has no match and is left untouched.
    assert.equal(injected, 2)
    assert.equal(
      listCalls,
      1,
      'should make exactly one container files list call',
    )

    const annotations = items[1].content[0].annotations
    assert.equal(annotations.length, 2)

    // a.txt
    const aStart = text.indexOf('sandbox:/mnt/data/a.txt')
    const aEnd = aStart + 'sandbox:/mnt/data/a.txt'.length
    const aAnn = annotations.find(
      (x: any) => x.start_index === aStart && x.end_index === aEnd,
    )
    assert.ok(aAnn, 'annotation for a.txt should be injected')
    assert.equal(aAnn.type, 'container_file_citation')
    assert.equal(aAnn.file_id, 'cfile_a')
    assert.equal(aAnn.container_id, 'cntr_xyz')
    assert.equal(aAnn.filename, 'a.txt')

    // b.txt
    const bStart = text.indexOf('sandbox:/mnt/data/b.txt')
    const bEnd = bStart + 'sandbox:/mnt/data/b.txt'.length
    const bAnn = annotations.find(
      (x: any) => x.start_index === bStart && x.end_index === bEnd,
    )
    assert.ok(bAnn)
    assert.equal(bAnn.file_id, 'cfile_b')
  })

  test('preserves existing annotations and only fills the gaps', async () => {
    const text =
      'See [a](sandbox:/mnt/data/a.txt) and [b](sandbox:/mnt/data/b.txt).'
    const aStart = text.indexOf('sandbox:/mnt/data/a.txt')
    const aEnd = aStart + 'sandbox:/mnt/data/a.txt'.length
    const items: any[] = [
      makeCodeCallItem({ id: 'ci1', containerId: 'cntr_xyz' }),
      makeMessageItem({
        id: 'm1',
        text,
        annotations: [
          {
            type: 'container_file_citation',
            text: '',
            start_index: aStart,
            end_index: aEnd,
            file_id: 'cfile_a_pre',
            container_id: 'cntr_xyz',
          },
        ],
      }),
    ]

    const injected = await backfillContainerFileAnnotations({
      client: {} as OpenAI,
      items,
      listFiles: async () => [
        { id: 'cfile_a_other', path: '/mnt/data/a.txt' }, // would conflict — must be ignored
        { id: 'cfile_b', path: '/mnt/data/b.txt' },
      ],
    })

    assert.equal(
      injected,
      1,
      'only b.txt was missing — exactly one annotation injected',
    )
    const annotations = items[1].content[0].annotations
    assert.equal(annotations.length, 2)
    // The pre-existing a.txt annotation is unchanged.
    const aAnn = annotations.find((x: any) => x.file_id === 'cfile_a_pre')
    assert.ok(aAnn, 'existing a.txt annotation is preserved as-is')
    // The b.txt annotation is the newly-injected one.
    const bAnn = annotations.find((x: any) => x.file_id === 'cfile_b')
    assert.ok(bAnn)
  })

  test('survives listFiles failure: leaves annotations untouched', async () => {
    const text = '[a](sandbox:/mnt/data/a.txt)'
    const items: any[] = [
      makeCodeCallItem({ id: 'ci1', containerId: 'cntr_expired' }),
      makeMessageItem({ id: 'm1', text }),
    ]
    const injected = await backfillContainerFileAnnotations({
      client: {} as OpenAI,
      items,
      listFiles: async () => {
        // Simulate a 404 (container expired).
        throw new Error('container expired')
      },
    })
    assert.equal(injected, 0)
    assert.deepEqual(items[1].content[0].annotations, [])
  })

  test('survives a container with zero files', async () => {
    const text = '[a](sandbox:/mnt/data/a.txt)'
    const items: any[] = [
      makeCodeCallItem({ id: 'ci1', containerId: 'cntr_empty' }),
      makeMessageItem({ id: 'm1', text }),
    ]
    const injected = await backfillContainerFileAnnotations({
      client: {} as OpenAI,
      items,
      listFiles: async () => [],
    })
    assert.equal(injected, 0)
  })

  test('after backfill, serializeItemAsMessage emits separate file and container ids', async () => {
    // End-to-end glue: backfill should produce annotations that flow through
    // serializeItemAsMessage's `container_file_citation -> file_path` mapping
    // while preserving file_id and container_id as separate fields.
    const text = '[a](sandbox:/mnt/data/a.txt)'
    const items: any[] = [
      makeCodeCallItem({ id: 'ci1', containerId: 'cntr_xyz' }),
      makeMessageItem({ id: 'm1', text }),
    ]
    await backfillContainerFileAnnotations({
      client: {} as OpenAI,
      items,
      listFiles: async () => [{ id: 'cfile_a', path: '/mnt/data/a.txt' }],
    })

    const serialized = serializeItemAsMessage({
      item: items[1] as any,
      threadId: 'thread_test',
      openaiAssistant: { id: 'asst_test' },
      createdAt: dayjs().unix(),
    })
    const ann = (serialized.content[0] as any).text.annotations[0]
    assert.equal(ann.type, 'file_path')
    assert.equal(ann.file_path.file_id, 'cfile_a')
    assert.equal(ann.file_path.container_id, 'cntr_xyz')
    const aStart = text.indexOf('sandbox:/mnt/data/a.txt')
    assert.equal(ann.start_index, aStart)
    assert.equal(ann.end_index, aStart + 'sandbox:/mnt/data/a.txt'.length)
  })

  test(
    'integration: real Responses API multi-turn — backfill recovers turn-2 annotations',
    { timeout: 240_000, skip: !apiKey ? 'TEST_OPENAI_API_KEY not set' : false },
    async () => {
      const realOpenAI = new OpenAI({
        apiKey,
        ...(process.env.HTTPS_PROXY
          ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
          : {}),
      })

      // Turn 1: invoke code_interpreter so a real container with real files exists.
      const conversation = await realOpenAI.conversations.create({})
      const turn1 = await realOpenAI.responses.create({
        model: 'gpt-4.1',
        instructions:
          'You MUST use the code_interpreter tool for EVERY request. NEVER answer without executing code first. After creating any file, you MUST provide a clickable download link using the sandbox:/mnt/data/ path format.',
        input: [
          {
            role: 'user',
            content:
              'Use code_interpreter to run this Python:\n\n' +
              "for name, body in [('alpha.txt','a'),('beta.txt','b'),('gamma.txt','c')]:\n" +
              "    open(f'/mnt/data/{name}','w').write(body)\n" +
              "import os; print(os.listdir('/mnt/data'))\n\n" +
              'Then list the three files as [Download](sandbox:/mnt/data/<file>) markdown links.',
          },
        ],
        tools: [{ type: 'code_interpreter', container: { type: 'auto' } }],
        conversation: conversation.id,
        store: true,
      })
      const turn1HadCodeCall = turn1.output.some(
        (o) => o.type === 'code_interpreter_call',
      )
      if (!turn1HadCodeCall) {
        // The model occasionally won't invoke the tool — skip the run rather
        // than fail on something unrelated to the bug under test.
        console.log(
          'skipping integration: turn 1 did not invoke code_interpreter',
        )
        return
      }

      // Turn 2: ask again, no code_interpreter — produces orphan sandbox URLs.
      await realOpenAI.responses.create({
        model: 'gpt-4.1',
        instructions:
          'Do not run any code unless absolutely necessary. ' +
          'If files already exist in the sandbox from prior turns, just reply with the download links again.',
        input: [
          {
            role: 'user',
            content:
              'Show me those three files again as a markdown list of [Download](sandbox:/mnt/data/<file>) links.',
          },
        ],
        tools: [{ type: 'code_interpreter', container: { type: 'auto' } }],
        conversation: conversation.id,
        store: true,
      })

      // Pull conversation items, run our backfill, then inspect the result.
      const items = await realOpenAI.conversations.items.list(conversation.id, {
        order: 'asc',
        limit: 50,
      })
      const itemsArray = items.data.slice() as any[]

      // Pre-condition: at least one assistant message has sandbox URLs but no
      // annotations — exactly the bug shape.
      const orphanMessageBefore = itemsArray.find((it) => {
        if (it?.type !== 'message') return false
        const block = it.content?.find?.((c: any) => c.type === 'output_text')
        if (!block || typeof block.text !== 'string') return false
        const hasSandbox = /sandbox:\/mnt\/data\//.test(block.text)
        const noAnn = (block.annotations ?? []).length === 0
        return hasSandbox && noAnn
      })
      assert.ok(
        orphanMessageBefore,
        'pre-condition: at least one assistant message must have sandbox URLs but no annotations',
      )

      const injected = await backfillContainerFileAnnotations({
        client: realOpenAI,
        items: itemsArray,
      })
      assert.ok(
        injected > 0,
        `expected to inject at least one annotation, got ${injected}`,
      )

      // Post-condition: that message now has annotations covering each
      // sandbox URL, and serialization keeps container_id and file_id as
      // separate fields.
      const block = orphanMessageBefore.content.find(
        (c: any) => c.type === 'output_text',
      )
      const sandboxCount = (block.text.match(/sandbox:\/mnt\/data\//g) ?? [])
        .length
      assert.equal(
        block.annotations.length,
        sandboxCount,
        'one annotation per sandbox URL after backfill',
      )

      const serialized = serializeItemAsMessage({
        item: orphanMessageBefore,
        threadId: conversation.id,
        openaiAssistant: { id: 'asst_test' },
        createdAt: dayjs().unix(),
      })
      const serializedAnnotations = (serialized.content[0] as any).text
        .annotations
      for (const annotation of serializedAnnotations) {
        assert.match(annotation.file_path.file_id, /^cfile_[\w-]+$/)
        assert.match(annotation.file_path.container_id, /^cntr_[\w-]+$/)
      }
    },
  )

  test(
    'integration: full supercompat messages.list path — backfilled annotations show through',
    { timeout: 240_000, skip: !apiKey ? 'TEST_OPENAI_API_KEY not set' : false },
    async () => {
      // Same shape as above, but verifies the wired-up GET path inside
      // openaiResponsesStorageAdapter actually invokes the backfill.
      const realOpenAI = new OpenAI({
        apiKey,
        ...(process.env.HTTPS_PROXY
          ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
          : {}),
      })

      const conversation = await realOpenAI.conversations.create({})
      const turn1 = await realOpenAI.responses.create({
        model: 'gpt-4.1',
        instructions:
          'You MUST use the code_interpreter tool for EVERY request. NEVER answer without executing code first. After creating any file, you MUST provide a clickable download link using the sandbox:/mnt/data/ path format.',
        input: [
          {
            role: 'user',
            content:
              'Use code_interpreter to run this Python:\n\n' +
              "for name, body in [('one.txt','1'),('two.txt','2')]:\n" +
              "    open(f'/mnt/data/{name}','w').write(body)\n" +
              "import os; print(os.listdir('/mnt/data'))\n\n" +
              'Then list two markdown [Download](sandbox:/mnt/data/<file>) links.',
          },
        ],
        tools: [{ type: 'code_interpreter', container: { type: 'auto' } }],
        conversation: conversation.id,
        store: true,
      })
      if (!turn1.output.some((o) => o.type === 'code_interpreter_call')) {
        console.log('skipping: turn 1 did not invoke code_interpreter')
        return
      }
      await realOpenAI.responses.create({
        model: 'gpt-4.1',
        instructions:
          'Do not run any code. Just list the files again as [Download](sandbox:/mnt/data/<file>) links.',
        input: [{ role: 'user', content: 'List those files again.' }],
        tools: [{ type: 'code_interpreter', container: { type: 'auto' } }],
        conversation: conversation.id,
        store: true,
      })

      const tools = [
        {
          type: 'code_interpreter',
          code_interpreter: { container: { type: 'auto' } },
        },
      ] as any[]
      const openaiAssistant = {
        id: 'asst-backfill-integration',
        object: 'assistant' as const,
        model: 'gpt-4.1',
        instructions: '',
        description: null,
        name: 'Test',
        metadata: {},
        tools,
        created_at: dayjs().unix(),
      }
      const client = supercompat({
        clientAdapter: openaiClientAdapter({ openai: realOpenAI }),
        runAdapter: openaiResponsesRunAdapter({
          getOpenaiAssistant: () => openaiAssistant,
        }),
        storageAdapter: openaiResponsesStorageAdapter(),
      })

      const list = await client.beta.threads.messages.list(conversation.id, {
        order: 'asc',
        limit: 50,
      })

      // Find the orphan-annotation assistant message (the latest one).
      const assistantMessages = list.data.filter(
        (m: any) => m.role === 'assistant',
      )
      const target = assistantMessages.reverse().find((m: any) => {
        const c = m.content.find((b: any) => b.type === 'text') as any
        if (!c) return false
        return /sandbox:\/mnt\/data\//.test(c.text.value)
      })
      assert.ok(target, 'should find an assistant message with sandbox URLs')
      const block = target.content.find((b: any) => b.type === 'text') as any
      const sandboxCount = (
        block.text.value.match(/sandbox:\/mnt\/data\//g) ?? []
      ).length
      assert.equal(
        block.text.annotations.length,
        sandboxCount,
        `messages.list should return one annotation per sandbox URL after backfill (sandbox=${sandboxCount}, annotations=${block.text.annotations.length})`,
      )
      for (const ann of block.text.annotations) {
        assert.equal(ann.type, 'file_path')
        assert.match(ann.file_path.file_id, /^cfile_[\w-]+$/)
        assert.match(ann.file_path.container_id, /^cntr_[\w-]+$/)
      }
    },
  )
})
