import type OpenAI from 'openai'
import assert from 'node:assert/strict'
import { config } from '../lib/config'
import { assertResponseShape } from '../lib/assertions'

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
  // Upload a file
  const fileContent = new Blob(
    ['Project Thunderbolt launched on March 15, 2026. Budget: $4.2 million. Lead: Dr. Smith.'],
    { type: 'text/plain' },
  )
  const file = await client.files.create({
    file: new File([fileContent], 'project-info.txt'),
    purpose: 'assistants',
  })

  // Create vector store
  const vectorStore = await client.vectorStores.create({
    name: 'Responses Test Store',
    file_ids: [file.id],
  })

  // Wait for indexing
  for (let i = 0; i < 30; i++) {
    const vs = await client.vectorStores.retrieve(vectorStore.id)
    if (vs.file_counts.completed > 0) break
    await new Promise(r => setTimeout(r, 1000))
  }
  await new Promise(r => setTimeout(r, 2000))

  const response = await client.responses.create({
    model: config.model,
    input: 'Search the files: what is the project codename and who is the lead?',
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
    text.includes('thunderbolt') || text.includes('smith'),
    `Should mention project info. Got: "${text.slice(0, 200)}"`,
  )

  // Cleanup
  await client.vectorStores.delete(vectorStore.id)
  await client.files.delete(file.id)
}

export const codeInterpreter: ResponsesContract = async (client) => {
  const response = await client.responses.create({
    model: config.model,
    input: 'Use code interpreter to calculate: sum of numbers from 1 to 100. Execute the code and tell me the exact result.',
    instructions: 'You MUST use code_interpreter. Execute code, do not compute manually.',
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
