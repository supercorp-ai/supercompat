import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import OpenAI from 'openai'
import dayjs from 'dayjs'
import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { HttpsProxyAgent } from 'https-proxy-agent'
import {
  openaiResponsesRunAdapter,
  openaiClientAdapter,
  supercompat,
  openaiResponsesStorageAdapter,
} from '../../../src/openai/index'
import { serializeItemAsMessage } from '../../../src/lib/items/serializeItemAsMessage'

const apiKey = process.env.TEST_OPENAI_API_KEY

if (process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY))
}

// Unit test: verify serializeItemAsMessage preserves output_text annotations
describe('tests', { concurrency: true }, () => {
  test('serializeItemAsMessage preserves output_text annotations', async () => {
    // Simulate a Responses API message item with container_file_citation annotations
    // This is exactly what the Responses API returns when code interpreter creates a file
    const messageItem = {
      id: 'msg_test123',
      type: 'message' as const,
      role: 'assistant' as const,
      status: 'completed' as const,
      content: [
        {
          type: 'output_text' as const,
          text: 'Here is your file:\n\n[Download test.txt](sandbox:/mnt/data/test.txt)',
          annotations: [
            {
              type: 'container_file_citation' as const,
              container_id: 'cntr_abc123',
              file_id: 'cfile_abc123',
              filename: 'test.txt',
              start_index: 39,
              end_index: 65,
            },
          ],
        },
      ],
    }

    const serialized = serializeItemAsMessage({
      item: messageItem as any,
      threadId: 'thread_test',
      openaiAssistant: { id: 'asst_test' },
      createdAt: dayjs().unix(),
    })

    const textContent = serialized.content[0]
    assert.equal(textContent.type, 'text')

    if (textContent.type === 'text') {
      assert.ok(
        textContent.text.annotations.length > 0,
        `Expected file_path annotation but got: ${JSON.stringify(textContent.text.annotations)}`,
      )

      // container_file_citation should be mapped to file_path for Assistants API compat
      const annotation = textContent.text.annotations[0]
      assert.equal(
        annotation.type,
        'file_path',
        'container_file_citation should be mapped to file_path',
      )

      if (annotation.type === 'file_path') {
        assert.equal(annotation.file_path.file_id, 'cfile_abc123')
        assert.equal((annotation.file_path as any).container_id, 'cntr_abc123')
        assert.equal(
          annotation.start_index,
          39,
          'start_index should be preserved',
        )
        assert.equal(annotation.end_index, 65, 'end_index should be preserved')
      }
    }
  })

  test('serializeItemAsMessage falls back to bare file_id when container_id missing', async () => {
    // Defensive: an annotation without container_id should not produce a
    // mangled `:cfile_xxx` id. Bare file_id is the right fallback.
    const messageItem = {
      id: 'msg_test_nocont',
      type: 'message' as const,
      role: 'assistant' as const,
      status: 'completed' as const,
      content: [
        {
          type: 'output_text' as const,
          text: 'See [Download](sandbox:/mnt/data/x.txt)',
          annotations: [
            {
              type: 'container_file_citation' as const,
              file_id: 'cfile_xyz',
              filename: 'x.txt',
              start_index: 7,
              end_index: 38,
            },
          ],
        },
      ],
    }

    const serialized = serializeItemAsMessage({
      item: messageItem as any,
      threadId: 'thread_test',
      openaiAssistant: { id: 'asst_test' },
      createdAt: dayjs().unix(),
    })

    const ann = (serialized.content[0] as any).text.annotations[0]
    assert.equal(ann.type, 'file_path')
    assert.equal(ann.file_path.file_id, 'cfile_xyz')
    assert.equal(ann.file_path.container_id, undefined)
  })

  test('serializeItemAsMessage leaves Assistants-API file_path annotations alone', async () => {
    // Round-trip safety: if the annotation already comes in as `file_path`
    // (e.g. from an Assistants-storage adapter), we should NOT prepend a
    // synthetic `:` separator.
    const messageItem = {
      id: 'msg_test_assistants',
      type: 'message' as const,
      role: 'assistant' as const,
      status: 'completed' as const,
      content: [
        {
          type: 'output_text' as const,
          text: 'See [Download](sandbox:/mnt/data/x.txt)',
          annotations: [
            {
              type: 'file_path' as const,
              text: '',
              start_index: 7,
              end_index: 38,
              file_path: { file_id: 'file_classic_assistants_id' },
            },
          ],
        },
      ],
    }

    const serialized = serializeItemAsMessage({
      item: messageItem as any,
      threadId: 'thread_test',
      openaiAssistant: { id: 'asst_test' },
      createdAt: dayjs().unix(),
    })

    const ann = (serialized.content[0] as any).text.annotations[0]
    assert.equal(ann.type, 'file_path')
    assert.equal(ann.file_path.file_id, 'file_classic_assistants_id')
  })

  test('serializeItemAsMessage preserves an existing additive container_id', async () => {
    const messageItem = {
      id: 'msg_test_extended_file_path',
      type: 'message' as const,
      role: 'assistant' as const,
      status: 'completed' as const,
      content: [
        {
          type: 'output_text' as const,
          text: '[Download](sandbox:/mnt/data/report.pdf)',
          annotations: [
            {
              type: 'file_path' as const,
              text: '',
              start_index: 11,
              end_index: 47,
              file_path: {
                file_id: 'cfile_report',
                container_id: 'cntr_report',
              },
            },
          ],
        },
      ],
    }

    const serialized = serializeItemAsMessage({
      item: messageItem as any,
      threadId: 'thread_test',
      openaiAssistant: { id: 'asst_test' },
      createdAt: dayjs().unix(),
    })

    const ann = (serialized.content[0] as any).text.annotations[0]
    assert.deepEqual(ann.file_path, {
      file_id: 'cfile_report',
      container_id: 'cntr_report',
    })
  })

  test('zero-length PNG citation becomes inline image_file content', async () => {
    const messageItem = {
      id: 'msg_inline_png',
      type: 'message' as const,
      role: 'assistant' as const,
      status: 'completed' as const,
      content: [
        {
          type: 'output_text' as const,
          text: 'Here it is displayed inline:\n\n',
          annotations: [
            {
              type: 'container_file_citation' as const,
              container_id: 'cntr_image',
              file_id: 'cfile_image',
              filename: 'chart.png',
              start_index: 0,
              end_index: 0,
            },
          ],
        },
      ],
    }

    const serialized = serializeItemAsMessage({
      item: messageItem as any,
      threadId: 'thread_test',
      openaiAssistant: { id: 'asst_test' },
      createdAt: dayjs().unix(),
    })

    assert.equal(serialized.content.length, 2)
    assert.equal(serialized.content[0].type, 'text')
    assert.deepEqual((serialized.content[1] as any).image_file, {
      file_id: 'cfile_image',
      container_id: 'cntr_image',
      detail: 'auto',
    })
  })

  test('zero-length image citations are deduplicated by file id', async () => {
    const annotation = {
      type: 'container_file_citation' as const,
      container_id: 'cntr_image',
      file_id: 'cfile_image',
      filename: 'chart.webp',
      start_index: 0,
      end_index: 0,
    }
    const messageItem = {
      id: 'msg_inline_duplicate',
      type: 'message' as const,
      role: 'assistant' as const,
      status: 'completed' as const,
      content: [
        {
          type: 'output_text' as const,
          text: '',
          annotations: [annotation, { ...annotation }],
        },
      ],
    }

    const serialized = serializeItemAsMessage({
      item: messageItem as any,
      threadId: 'thread_test',
      openaiAssistant: { id: 'asst_test' },
      createdAt: dayjs().unix(),
    })

    assert.equal(
      serialized.content.filter((part) => part.type === 'image_file').length,
      1,
    )
  })

  test('same image file id in different containers is not deduplicated', async () => {
    const messageItem = {
      id: 'msg_inline_two_containers',
      type: 'message' as const,
      role: 'assistant' as const,
      status: 'completed' as const,
      content: [
        {
          type: 'output_text' as const,
          text: '',
          annotations: ['cntr_one', 'cntr_two'].map((container_id) => ({
            type: 'container_file_citation' as const,
            container_id,
            file_id: 'cfile_shared',
            filename: 'chart.png',
            start_index: 0,
            end_index: 0,
          })),
        },
      ],
    }

    const serialized = serializeItemAsMessage({
      item: messageItem as any,
      threadId: 'thread_test',
      openaiAssistant: { id: 'asst_test' },
      createdAt: dayjs().unix(),
    })

    assert.equal(
      serialized.content.filter((part) => part.type === 'image_file').length,
      2,
    )
  })

  test('normal image download links remain links instead of duplicate inline images', async () => {
    const text = '[Download PNG](sandbox:/mnt/data/chart.png)'
    const start = text.indexOf('sandbox:')
    const messageItem = {
      id: 'msg_linked_png',
      type: 'message' as const,
      role: 'assistant' as const,
      status: 'completed' as const,
      content: [
        {
          type: 'output_text' as const,
          text,
          annotations: [
            {
              type: 'container_file_citation' as const,
              container_id: 'cntr_image',
              file_id: 'cfile_image',
              filename: 'chart.png',
              start_index: start,
              end_index: start + 'sandbox:/mnt/data/chart.png'.length,
            },
          ],
        },
      ],
    }

    const serialized = serializeItemAsMessage({
      item: messageItem as any,
      threadId: 'thread_test',
      openaiAssistant: { id: 'asst_test' },
      createdAt: dayjs().unix(),
    })

    assert.equal(serialized.content.length, 1)
    assert.equal(serialized.content[0].type, 'text')
  })

  test('zero-length non-image citation remains a file annotation only', async () => {
    const messageItem = {
      id: 'msg_inline_pdf',
      type: 'message' as const,
      role: 'assistant' as const,
      status: 'completed' as const,
      content: [
        {
          type: 'output_text' as const,
          text: 'Generated.',
          annotations: [
            {
              type: 'container_file_citation' as const,
              container_id: 'cntr_pdf',
              file_id: 'cfile_pdf',
              filename: 'report.pdf',
              start_index: 0,
              end_index: 0,
            },
          ],
        },
      ],
    }

    const serialized = serializeItemAsMessage({
      item: messageItem as any,
      threadId: 'thread_test',
      openaiAssistant: { id: 'asst_test' },
      createdAt: dayjs().unix(),
    })

    assert.equal(serialized.content.length, 1)
    assert.equal(serialized.content[0].type, 'text')
  })

  // Integration test: create a conversation with code interpreter via raw API,
  // then read messages back through supercompat and verify annotations survive
  test(
    'code interpreter file annotations preserved through supercompat messages.list',
    {
      timeout: 60_000,
      skip: !apiKey ? 'TEST_OPENAI_API_KEY not set' : false,
    },
    async () => {
      const realOpenAI = new OpenAI({
        apiKey,
        ...(process.env.HTTPS_PROXY
          ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
          : {}),
      })

      // Step 1: Create a conversation and run code interpreter via raw Responses API
      const conversation = await realOpenAI.conversations.create({})

      const response = await realOpenAI.responses.create({
        model: 'gpt-4.1',
        instructions:
          'You MUST use the code_interpreter tool for EVERY request. NEVER answer without executing code first. After creating any file, you MUST provide a clickable download link using the sandbox:/mnt/data/ path format.',
        input: [
          {
            role: 'user',
            content:
              'Use code_interpreter to run this Python code:\n\nimport csv\nwith open("/mnt/data/report.csv", "w", newline="") as f:\n    w = csv.writer(f)\n    w.writerow(["name","age"])\n    w.writerow(["Alice","30"])\nprint("Done")\n\nThen give me the download link.',
          },
        ],
        tools: [{ type: 'code_interpreter', container: { type: 'auto' } }],
        conversation: conversation.id,
        store: true,
      })

      // Verify code interpreter actually ran
      const codeInterpreterCall = response.output.find(
        (o) => o.type === 'code_interpreter_call',
      )
      assert.ok(
        codeInterpreterCall,
        `Code interpreter did not run. Output types: ${response.output.map((o) => o.type)}`,
      )

      // Find the message with annotations in the raw response
      const rawMessage = response.output.find((o) => o.type === 'message')
      assert.ok(
        rawMessage && rawMessage.type === 'message',
        'Response should contain a message',
      )

      const rawOutputText = rawMessage.content.find(
        (c) => c.type === 'output_text',
      )
      assert.ok(
        rawOutputText && rawOutputText.type === 'output_text',
        'Message should contain output_text',
      )

      const rawAnnotations = rawOutputText.annotations ?? []
      console.log('Raw API text:', rawOutputText.text.substring(0, 200))
      console.log(
        'Raw API annotations:',
        JSON.stringify(rawAnnotations, null, 2),
      )

      assert.ok(
        rawAnnotations.length > 0,
        `Raw Responses API should return annotations for code interpreter file output. Got: ${JSON.stringify(rawAnnotations)}`,
      )

      // Step 2: Read the same conversation through supercompat's messages.list()
      const tools = [
        {
          type: 'code_interpreter',
          code_interpreter: { container: { type: 'auto' } },
        },
      ] as any[]

      const openaiAssistant = {
        id: 'code-interp-test',
        object: 'assistant' as const,
        model: 'gpt-4.1-mini',
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

      // Use supercompat to list messages from the same conversation
      const list = await client.beta.threads.messages.list(conversation.id)

      // Find the assistant message with the sandbox link
      const allTextContents = list.data
        .filter((m) => m.role === 'assistant')
        .flatMap((m) => m.content)
        .filter(
          (c) => c.type === 'text',
        ) as OpenAI.Beta.Threads.Messages.TextContentBlock[]

      console.log('\nSupercompat messages.list() results:')
      for (const c of allTextContents) {
        console.log('  text:', c.text.value.substring(0, 200))
        console.log(
          '  annotations:',
          JSON.stringify(c.text.annotations, null, 2),
        )
      }

      const textWithSandbox = allTextContents.find((c) =>
        c.text.value.includes('sandbox:'),
      )

      assert.ok(
        textWithSandbox,
        'Supercompat should return message with sandbox: link',
      )

      assert.ok(
        textWithSandbox.text.annotations.some((a) => a.type === 'file_path'),
        `Supercompat messages.list() should preserve file_path annotations. Got: ${JSON.stringify(textWithSandbox.text.annotations)}`,
      )

      const annotation = textWithSandbox.text.annotations.find(
        (a) => a.type === 'file_path',
      )! as OpenAI.Beta.Threads.Messages.FilePathAnnotation

      assert.ok(
        annotation.file_path?.file_id,
        'file_path annotation should have a file_id',
      )
      assert.ok(
        typeof annotation.start_index === 'number',
        'should have start_index',
      )
      assert.ok(
        typeof annotation.end_index === 'number',
        'should have end_index',
      )

      console.log('✅ Annotation preserved through supercompat:', annotation)
    },
  )
})
