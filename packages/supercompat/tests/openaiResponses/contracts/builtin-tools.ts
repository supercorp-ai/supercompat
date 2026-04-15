import type OpenAI from 'openai'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './lib/config'

const __dirname = dirname(fileURLToPath(import.meta.url))
import { assertResponseShape } from './lib/assertions'

export type ResponsesContract = (client: OpenAI) => Promise<void>

export const webSearch: ResponsesContract = async (client) => {
  const response = await client.responses.create({
    model: config.model,
    input: 'What is the current population of Tokyo? Use web search.',
    tools: [{ type: 'web_search_preview' }],
  })

  assertResponseShape(response, 'web search')
  assert.equal(response.status, 'completed')

  // Should have web search results or a message referencing the search
  const messageItem = response.output.find((o: any) => o.type === 'message')
  assert.ok(messageItem, 'Should have message output')
  const text = messageItem.content[0]?.text?.toLowerCase() ?? ''
  assert.ok(text.includes('million') || text.includes('tokyo') || text.includes('population'),
    `Response should reference Tokyo population. Got: "${text.slice(0, 150)}"`)
}

export const fileSearch: ResponsesContract = async (client) => {
  // Upload a PDF file ("Lucky number is 2")
  const pdfBytes = readFileSync(join(__dirname, '..', '..', 'openaiAssistants', 'contracts', 'lib', 'example.pdf'))
  const file = await client.files.create({
    file: new File([pdfBytes], 'example.pdf', { type: 'application/pdf' }),
    purpose: 'assistants',
  })

  // Create vector store
  const vectorStore = await client.vectorStores.create({
    name: 'Responses Test Store',
    file_ids: [file.id],
  })

  // Wait for indexing — poll until file is fully indexed
  for (let i = 0; i < 90; i++) {
    const vs = await client.vectorStores.retrieve(vectorStore.id)
    if (vs.file_counts.completed > 0 && vs.file_counts.in_progress === 0) break
    await new Promise(r => setTimeout(r, 1000))
  }

  const response = await client.responses.create({
    model: config.model,
    temperature: 0,
    input: 'What is the lucky number in the file? Reply with just the number.',
    instructions: 'You MUST use file_search. ALWAYS search before answering.',
    tools: [{
      type: 'file_search',
      vector_store_ids: [vectorStore.id],
    }],
  })

  assertResponseShape(response, 'file search')
  assert.equal(response.status, 'completed')

  const messageItem = response.output.find((o: any) => o.type === 'message')
  assert.ok(messageItem, 'Should have message')
  const text = messageItem.content[0]?.text?.toLowerCase() ?? ''
  assert.ok(
    text.includes('2'),
    `Should mention the lucky number 2. Got: "${text.slice(0, 200)}"`,
  )

  // Cleanup
  await client.vectorStores.delete(vectorStore.id)
  await client.files.delete(file.id)
}

export const fileInputInline: ResponsesContract = async (client) => {
  // Upload a PDF and pass it as input_file — the model reads it directly without file_search
  const pdfBytes = readFileSync(join(__dirname, '..', '..', 'openaiAssistants', 'contracts', 'lib', 'example.pdf'))
  const file = await client.files.create({
    file: new File([pdfBytes], 'example.pdf', { type: 'application/pdf' }),
    purpose: 'assistants',
  })

  const response = await client.responses.create({
    model: config.model,
    temperature: 0,
    instructions: 'You MUST read the attached PDF file. Answer based ONLY on what the file says. Do NOT guess or make up numbers.',
    input: [{
      type: 'message',
      role: 'user',
      content: [
        { type: 'input_file', file_id: file.id },
        { type: 'input_text', text: 'Read the attached PDF. It contains a heading that says "Lucky number is" followed by a digit. What is that exact digit? Reply with ONLY that single digit.' },
      ],
    }],
  })

  assertResponseShape(response, 'file input inline')
  assert.equal(response.status, 'completed')

  const messageItem = response.output.find((o: any) => o.type === 'message')
  assert.ok(messageItem, 'Should have message')
  const text = messageItem.content[0]?.text?.toLowerCase() ?? ''
  assert.ok(
    text.includes('2'),
    `Should mention the lucky number 2. Got: "${text.slice(0, 200)}"`,
  )

  await client.files.delete(file.id)
}

export const codeInterpreter: ResponsesContract = async (client) => {
  const response = await client.responses.create({
    model: config.model,
    temperature: 0,
    input: 'Execute this code using code_interpreter and return the exact output: print(sum(range(1, 101)))',
    instructions: 'You MUST use code_interpreter to execute the code. Do NOT describe what you would do. Do NOT compute manually. Execute the code immediately and return the output.',
    tools: [{
      type: 'code_interpreter',
      container: { type: 'auto' },
    }],
  })

  assertResponseShape(response, 'code interpreter')
  assert.equal(response.status, 'completed')

  // Should have a code_interpreter_call in output or mention 5050 in text
  const codeCall = response.output.find((o: any) => o.type === 'code_interpreter_call')
  const messageItem = response.output.find((o: any) => o.type === 'message')

  if (codeCall) {
    assert.equal(codeCall.type, 'code_interpreter_call')
  }

  // The result (5050) should appear somewhere
  const text = messageItem?.content?.[0]?.text?.toLowerCase() ?? ''
  assert.ok(
    text.includes('5050') || text.includes('5,050'),
    `Should mention 5050. Got: "${text.slice(0, 200)}"`,
  )
}

export const computerUse: ResponsesContract = async (client) => {
  // Computer use with GA models uses type: 'computer'
  const response = await client.responses.create({
    model: 'gpt-5.4-mini',
    input: 'Take a screenshot.',
    tools: [{ type: 'computer' as any }],
    truncation: 'auto',
  })

  assertResponseShape(response, 'computer use')
  // The model should either make a computer_call or complete
  // (without an actual environment, it may just respond with text)
  assert.ok(
    response.status === 'completed',
    `Status should be completed, got ${response.status}`,
  )
}
