import { test } from 'node:test'
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
    assert.equal(annotation.type, 'file_path', 'container_file_citation should be mapped to file_path')

    if (annotation.type === 'file_path') {
      assert.equal(annotation.file_path.file_id, 'cfile_abc123', 'file_id should be preserved')
      assert.equal(annotation.start_index, 39, 'start_index should be preserved')
      assert.equal(annotation.end_index, 65, 'end_index should be preserved')
    }
  }
})

// Integration test: create a conversation with code interpreter via raw API,
// then read messages back through supercompat and verify annotations survive
test('code interpreter file annotations preserved through supercompat messages.list', { timeout: 120_000 }, async () => {
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
    instructions: 'You MUST use the code_interpreter tool for EVERY request. NEVER answer without executing code first. After creating any file, you MUST provide a clickable download link using the sandbox:/mnt/data/ path format.',
    input: [{ role: 'user', content: 'Use code_interpreter to run this Python code:\n\nimport csv\nwith open("/mnt/data/report.csv", "w", newline="") as f:\n    w = csv.writer(f)\n    w.writerow(["name","age"])\n    w.writerow(["Alice","30"])\nprint("Done")\n\nThen give me the download link.' }],
    tools: [{ type: 'code_interpreter', container: { type: 'auto' } }],
    conversation: conversation.id,
    store: true,
  })

  // Verify code interpreter actually ran
  const codeInterpreterCall = response.output.find((o) => o.type === 'code_interpreter_call')
  assert.ok(codeInterpreterCall, `Code interpreter did not run. Output types: ${response.output.map((o) => o.type)}`)

  // Find the message with annotations in the raw response
  const rawMessage = response.output.find((o) => o.type === 'message')
  assert.ok(rawMessage && rawMessage.type === 'message', 'Response should contain a message')

  const rawOutputText = rawMessage.content.find((c) => c.type === 'output_text')
  assert.ok(rawOutputText && rawOutputText.type === 'output_text', 'Message should contain output_text')

  const rawAnnotations = rawOutputText.annotations ?? []
  console.log('Raw API text:', rawOutputText.text.substring(0, 200))
  console.log('Raw API annotations:', JSON.stringify(rawAnnotations, null, 2))

  assert.ok(
    rawAnnotations.length > 0,
    `Raw Responses API should return annotations for code interpreter file output. Got: ${JSON.stringify(rawAnnotations)}`,
  )

  // Step 2: Read the same conversation through supercompat's messages.list()
  const tools = [
    { type: 'code_interpreter', code_interpreter: { container: { type: 'auto' } } },
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
    client: openaiClientAdapter({ openai: realOpenAI }),
    runAdapter: openaiResponsesRunAdapter({
      getOpenaiAssistant: () => openaiAssistant,
    }),
    storage: openaiResponsesStorageAdapter(),
  })

  // Use supercompat to list messages from the same conversation
  const list = await client.beta.threads.messages.list(conversation.id)

  // Find the assistant message with the sandbox link
  const allTextContents = list.data
    .filter((m) => m.role === 'assistant')
    .flatMap((m) => m.content)
    .filter((c) => c.type === 'text') as OpenAI.Beta.Threads.Messages.TextContentBlock[]

  console.log('\nSupercompat messages.list() results:')
  for (const c of allTextContents) {
    console.log('  text:', c.text.value.substring(0, 200))
    console.log('  annotations:', JSON.stringify(c.text.annotations, null, 2))
  }

  const textWithSandbox = allTextContents.find((c) =>
    c.text.value.includes('sandbox:'),
  )

  assert.ok(textWithSandbox, 'Supercompat should return message with sandbox: link')

  assert.ok(
    textWithSandbox.text.annotations.some((a) => a.type === 'file_path'),
    `Supercompat messages.list() should preserve file_path annotations. Got: ${JSON.stringify(textWithSandbox.text.annotations)}`,
  )

  const annotation = textWithSandbox.text.annotations.find(
    (a) => a.type === 'file_path',
  )! as OpenAI.Beta.Threads.Messages.FilePathAnnotation

  assert.ok(annotation.file_path?.file_id, 'file_path annotation should have a file_id')
  assert.ok(typeof annotation.start_index === 'number', 'should have start_index')
  assert.ok(typeof annotation.end_index === 'number', 'should have end_index')

  console.log('✅ Annotation preserved through supercompat:', annotation)
})
