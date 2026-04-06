# Supercompat Conformance Testing Plan

## Core Principle

A developer should be able to swap `new OpenAI()` for `supercompat(...)` and have **zero code changes** in their application. Every response, every field, every stream event must behave identically.

To prove this, we:
1. Run operations against the **real OpenAI Assistants API** and record what comes back
2. Run the **exact same operations** through each supercompat adapter
3. Compare the results — not just types, but actual data, relationships, and behavior

## What "identical" means

Some things will naturally differ (IDs, timestamps). The test framework needs to understand this:

```
MUST be identical:
  - object types (assistant, thread.message, thread.run, thread.run.step)
  - status values
  - role values
  - content text (what the user wrote, what the tool returned)
  - tool names, arguments, outputs
  - metadata (what was passed in)
  - event names in streams
  - event ordering
  - list ordering and filtering behavior
  - error shapes

MUST exist but values will differ:
  - IDs (format may differ: asst_ vs uuid)
  - timestamps (created_at, completed_at, etc.)
  - usage stats (different underlying API)

MAY differ (model-dependent):
  - assistant response text content (different models produce different text)
  - whether model calls a tool (flaky — we control this via instructions)
```

## Test Architecture

### The Conformance Contract

Each test defines a **contract** — a sequence of operations and invariants that must hold:

```typescript
// A contract is a function that takes any OpenAI-compatible client
// and validates behavior. Same function runs against real API and adapters.

type Contract = (client: OpenAI, ctx: TestContext) => Promise<void>

// Example contract:
const toolCallRoundTrip: Contract = async (client, ctx) => {
  // SETUP: create assistant with tool
  const assistant = await client.beta.assistants.create({
    model: ctx.model,
    instructions: 'You MUST call get_weather for weather questions.',
    tools: [ctx.fixtures.weatherTool],
  })

  // INVARIANT: returned object matches what we sent
  ctx.assert.equal(assistant.object, 'assistant')
  ctx.assert.equal(assistant.instructions, 'You MUST call get_weather for weather questions.')
  ctx.assert.deepEqual(assistant.tools[0].type, 'function')

  // CREATE thread + message
  const thread = await client.beta.threads.create()
  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'Weather in SF?',
  })

  // RUN with streaming
  const run = await client.beta.threads.runs.create(thread.id, {
    assistant_id: assistant.id,
    stream: true,
    tools: [ctx.fixtures.weatherTool],
  })

  // COLLECT stream events
  const events = await ctx.collectEvents(run)

  // INVARIANT: stream event ordering
  ctx.assert.eventOrder(events, [
    'thread.run.created',
    'thread.run.in_progress',
    'thread.run.step.created',
    'thread.run.requires_action',  // tool call
  ])

  // INVARIANT: requires_action has correct tool call
  const requiresAction = events.find(e => e.event === 'thread.run.requires_action')
  ctx.assert.ok(requiresAction)
  const toolCalls = requiresAction.data.required_action.submit_tool_outputs.tool_calls
  ctx.assert.equal(toolCalls.length, 1)
  ctx.assert.equal(toolCalls[0].type, 'function')
  ctx.assert.equal(toolCalls[0].function.name, 'get_weather')
  ctx.assert.ok(toolCalls[0].function.arguments.includes('San Francisco') ||
                toolCalls[0].function.arguments.includes('SF'))

  // SUBMIT tool output
  const submit = await client.beta.threads.runs.submitToolOutputs(
    requiresAction.data.id,
    {
      thread_id: thread.id,
      stream: true,
      tool_outputs: [{
        tool_call_id: toolCalls[0].id,
        output: JSON.stringify({ temp: 72, unit: 'F', conditions: 'sunny' }),
      }],
    }
  )

  const submitEvents = await ctx.collectEvents(submit)

  // INVARIANT: run completes after submit
  ctx.assert.eventOrder(submitEvents, ['thread.run.completed'])
  const completed = submitEvents.find(e => e.event === 'thread.run.completed')
  ctx.assert.equal(completed.data.status, 'completed')

  // INVARIANT: messages.list returns user + assistant messages only
  const messages = await client.beta.threads.messages.list(thread.id)
  const roles = messages.data.map(m => m.role)
  ctx.assert.ok(roles.includes('user'))
  ctx.assert.ok(roles.includes('assistant'))
  // No tool call items leaked into messages
  for (const msg of messages.data) {
    ctx.assert.ok(['user', 'assistant'].includes(msg.role))
    ctx.assert.equal(msg.object, 'thread.message')
    for (const content of msg.content) {
      ctx.assert.ok(['text', 'image_file', 'image_url', 'refusal'].includes(content.type))
    }
  }

  // INVARIANT: assistant message references the run
  const assistantMsg = messages.data.find(m => m.role === 'assistant')
  ctx.assert.ok(assistantMsg)
  ctx.assert.equal(assistantMsg.run_id, requiresAction.data.id)

  // INVARIANT: run steps contain tool_calls + message_creation
  const steps = await client.beta.threads.runs.steps.list(thread.id, requiresAction.data.id)
  const stepTypes = steps.data.map(s => s.type)
  ctx.assert.ok(stepTypes.includes('tool_calls'))
  ctx.assert.ok(stepTypes.includes('message_creation'))

  // INVARIANT: tool call step has output after submit
  const toolStep = steps.data.find(s => s.type === 'tool_calls')
  ctx.assert.equal(toolStep.status, 'completed')
  const tc = toolStep.step_details.tool_calls[0]
  ctx.assert.equal(tc.type, 'function')
  ctx.assert.equal(tc.function.name, 'get_weather')
  ctx.assert.ok(tc.function.output)
  ctx.assert.ok(tc.function.output.includes('72'))

  // INVARIANT: message_creation step references the assistant message
  const msgStep = steps.data.find(s => s.type === 'message_creation')
  ctx.assert.equal(msgStep.step_details.message_creation.message_id, assistantMsg.id)

  // CLEANUP
  await ctx.cleanup(client, { assistantId: assistant.id, threadId: thread.id })
}
```

### Test Context

```typescript
interface TestContext {
  model: string                    // 'gpt-4.1-mini' for real API, varies per adapter
  fixtures: {
    weatherTool: OpenAI.Beta.AssistantTool
    multiTools: OpenAI.Beta.AssistantTool[]
  }
  assert: {
    // Standard assertions
    ok(value: any, message?: string): void
    equal(actual: any, expected: any, message?: string): void
    deepEqual(actual: any, expected: any, message?: string): void
    // Custom assertions
    eventOrder(events: StreamEvent[], expectedOrder: string[]): void
    shape: {
      assistant(obj: any): void
      thread(obj: any): void
      message(obj: any): void
      run(obj: any): void
      runStep(obj: any): void
      streamEvent(event: any): void
      paginatedList(list: any): void
    }
  }
  collectEvents(stream: AsyncIterable<any>): Promise<StreamEvent[]>
  cleanup(client: OpenAI, ids: { assistantId?: string, threadId?: string }): Promise<void>
}
```

### Running the Same Contract Against Multiple Targets

```typescript
// tests/conformance/runner.ts

import { contracts } from './contracts'

// Target: Real OpenAI Assistants API
describe('Baseline: OpenAI Assistants API', () => {
  const client = new OpenAI({ apiKey })
  const ctx = createContext({ model: 'gpt-4.1-mini' })

  for (const [name, contract] of Object.entries(contracts)) {
    test(name, () => contract(client, ctx))
  }
})

// Target: supercompat + responsesStorageAdapter
describe('responsesStorageAdapter', () => {
  const client = createResponsesClient()
  const ctx = createContext({ model: 'gpt-4.1-mini' })

  for (const [name, contract] of Object.entries(contracts)) {
    test(name, () => contract(client, ctx))
  }
})

// Target: supercompat + prismaStorageAdapter + OpenAI
describe('prismaStorageAdapter + OpenAI', () => {
  const client = createPrismaClient('openai')
  const ctx = createContext({ model: 'gpt-4.1-mini' })

  for (const [name, contract] of Object.entries(contracts)) {
    test(name, () => contract(client, ctx))
  }
})

// Target: supercompat + prismaStorageAdapter + Anthropic
describe('prismaStorageAdapter + Anthropic', () => {
  const client = createPrismaClient('anthropic')
  const ctx = createContext({ model: 'claude-sonnet-4-6' })

  for (const [name, contract] of Object.entries(contracts)) {
    test(name, () => contract(client, ctx))
  }
})
```

## Contracts

### Group 1: CRUD Operations

These are deterministic — no model involved, results must be exactly what was sent.

| Contract | What it validates |
|----------|-------------------|
| `createAssistant` | All fields returned match input. `object='assistant'`, tools array preserved, metadata preserved |
| `retrieveAssistant` | Same object as create. ID matches. |
| `updateAssistant` | Changed fields updated, unchanged fields preserved |
| `listAssistants` | Returns created assistants. Pagination shape correct. |
| `deleteAssistant` | Returns deletion confirmation |
| `createThread` | `object='thread'`, has id, created_at, metadata |
| `retrieveThread` | Same object as create |
| `updateThread` | Metadata updated |
| `deleteThread` | Deletion confirmation |
| `createMessage` | Content preserved. Role correct. `object='thread.message'` |
| `listMessages` | Returns created messages in order. Pagination works. |
| `retrieveMessage` | Same as from list |
| `updateMessage` | Metadata updated |
| `deleteMessage` | Deletion confirmation |

### Group 2: Run Lifecycle (no tools)

Involves model, but behavior is predictable (simple text completion).

| Contract | What it validates |
|----------|-------------------|
| `simpleRunPoll` | Create run → poll → completed. Message created. Steps have message_creation. |
| `simpleRunStream` | Same flow via streaming. Events in correct order. Each event has correct shape. |
| `runRetrieve` | After completion, retrieve returns same run with completed status |
| `runList` | After runs, list returns them |
| `multiTurnConversation` | Message → run → response → message → run → response. History preserved. |

### Group 3: Run Lifecycle (with function tools)

Tests the tool calling contract — the core of what supercompat must get right.

| Contract | What it validates |
|----------|-------------------|
| `toolCallRoundTrip` | Full cycle: run → requires_action → submit → completed. Messages, steps, outputs all correct. |
| `toolCallStream` | Same via streaming. Event order correct. |
| `multipleToolCalls` | Two tools called in parallel. Both in requires_action. Both outputs submitted. |
| `toolCallOutputPreserved` | After submit, `steps.list` shows the exact output string in `function.output` |
| `toolCallStepReferences` | `tool_calls` step and `message_creation` step reference correct IDs |
| `continueAfterToolCall` | After tool call round, send new message on same thread → new run works |

### Group 4: Stream Event Contract

The most fragile part — SSE format, event ordering, event data shapes.

| Contract | What it validates |
|----------|-------------------|
| `streamEventTypes` | Every event has `event` (string, not null) and `data` (object) |
| `streamEventOrder` | Events arrive in valid order (created before completed, steps within run) |
| `streamRunCreated` | `thread.run.created` event data is a valid Run object |
| `streamMessageDelta` | `thread.message.delta` has content array with text delta |
| `streamStepDelta` | `thread.run.step.delta` has step_details with tool_calls delta |
| `streamRequiresAction` | `thread.run.requires_action` has required_action with tool_calls |
| `streamCompleted` | `thread.run.completed` has usage stats |

### Group 5: Data Integrity

Validates relationships and data preservation across operations.

| Contract | What it validates |
|----------|-------------------|
| `metadataRoundTrip` | Create with metadata → retrieve → same metadata |
| `messageContentPreserved` | Create message with text → list → exact same text |
| `runIdOnMessage` | Assistant message has `run_id` matching the run |
| `threadIdConsistency` | All objects reference the same thread_id |
| `assistantIdOnRun` | Run has correct assistant_id |
| `stepRunIdConsistency` | All steps reference the same run_id |
| `messageStepLinkage` | message_creation step's message_id matches the actual message |
| `toolOutputInStep` | After submit, step's function.output matches what was submitted |
| `listOrderDesc` | messages.list default order is desc (newest first) |
| `listOrderAsc` | messages.list with order=asc returns oldest first |
| `paginationWorks` | Create 3 messages, list with limit=1, use after cursor, get all 3 |

### Group 6: Edge Cases

| Contract | What it validates |
|----------|-------------------|
| `emptyThread` | messages.list on empty thread returns empty data array |
| `runOnEmptyThread` | Error or expected behavior when running with no messages |
| `longMetadata` | Metadata with many keys, long values preserved |
| `specialCharContent` | Message with unicode, newlines, emoji preserved exactly |
| `toolCallWithEmptyArgs` | Tool with no required params, called with `{}`, works |
| `multipleRunsSameThread` | Two sequential runs on one thread, both complete, all messages preserved |

## File Structure

```
tests/
  conformance/
    contracts/
      index.ts              # exports all contracts by name
      crud.ts               # Group 1: CRUD operations
      run-lifecycle.ts      # Group 2: Simple runs
      tool-calls.ts         # Group 3: Tool calling
      stream-events.ts      # Group 4: Streaming
      data-integrity.ts     # Group 5: Relationships
      edge-cases.ts         # Group 6: Edge cases

    lib/
      context.ts            # TestContext factory
      assertions.ts         # Shape validators + custom assertions
      fixtures.ts           # Tool definitions, prompts
      clients.ts            # Client factories for each target
      cleanup.ts            # Resource cleanup helpers

    targets/
      baseline.test.ts      # Real OpenAI Assistants API
      responses.test.ts     # responsesStorageAdapter
      prisma-openai.test.ts # prismaStorageAdapter + OpenAI
      prisma-anthropic.test.ts
      prisma-google.test.ts
      azure-responses.test.ts
      azure-agents.test.ts
```

Each target file is minimal:

```typescript
// tests/conformance/targets/baseline.test.ts
import { runConformanceSuite } from '../lib/runner'
import { createBaselineClient } from '../lib/clients'

runConformanceSuite('OpenAI Assistants API (baseline)', createBaselineClient)

// tests/conformance/targets/responses.test.ts
import { runConformanceSuite } from '../lib/runner'
import { createResponsesClient } from '../lib/clients'

runConformanceSuite('responsesStorageAdapter', createResponsesClient)
```

## Implementation Order

### Step 1: Foundation
1. `lib/assertions.ts` — shape validators for all 5 object types + stream events
2. `lib/fixtures.ts` — deterministic tool definitions and prompts
3. `lib/context.ts` — TestContext with custom assertions
4. `lib/clients.ts` — client factories
5. `lib/cleanup.ts` — cleanup helpers

### Step 2: Baseline — DONE ✔
- 37 contracts, all passing against real OpenAI Assistants API
- CRUD: 11, Runs: 3, Tools: 10, Data integrity: 13

### Step 3: Adapter targets
- [ ] `targets/responses.test.ts` — run 37 contracts + backported tool contracts
- [ ] `targets/prisma-openai.test.ts` — run 37 contracts
- [ ] Fix adapter issues discovered by conformance tests
- [ ] `targets/prisma-anthropic.test.ts`
- [ ] `targets/prisma-google.test.ts`
- [ ] `targets/azure-responses.test.ts`
- [ ] `targets/azure-agents.test.ts`

### Step 4: Backported tool contracts (Responses adapter only)
- [ ] Computer use: round-trip, batched actions, single action, screenshot output
- [ ] Web search: search results in step
- [ ] Image generation: image URL in message content
- [ ] MCP: call + list_tools
- [ ] Code interpreter with container config

### Step 5: Provider-specific adapter tests
- [ ] Anthropic + completionsRunAdapter (tool calls, computer use)
- [ ] Google + completionsRunAdapter (tool calls, computer use)
- [ ] OpenRouter + completionsRunAdapter (tool calls)

## Backported Tools (Responses API → Assistants API compat)

The Assistants API only supports 3 tool types: `function`, `code_interpreter`, `file_search`.
The Responses API adds several more. Supercompat **backports** these into the Assistants API
compat surface, serializing them as run steps so they can be consumed by any Assistants API
client:

| Responses API type | Backported as | Run step type | How output appears |
|--------------------|---------------|---------------|-------------------|
| `computer_call` | `function` with `name: 'computer_call'` | `tool_calls` step | `function.output` = screenshot JSON |
| `web_search_call` | Custom `web_search` step | `tool_calls` step | Search results in step details |
| `image_generation_call` | `image_url` content on message | `tool_calls` step + message content | Image URL in message |
| `mcp_call` | `function`-like step | `tool_calls` step | MCP tool result |
| `mcp_list_tools` | Custom step | `tool_calls` step | List of available tools |
| `reasoning` | Custom step | Reasoning step | Internal reasoning trace |
| `code_interpreter_call` | `code_interpreter` step | `tool_calls` step | Code input + outputs |

Existing serializers in `src/lib/items/`:
- `serializeItemAsComputerCallRunStep.ts` — computer use → function tool call
- `serializeItemAsWebSearchRunStep.ts` — web search → step
- `serializeItemAsImageGenerationRunStep.ts` — image gen → step + message
- `serializeItemAsMcpCallRunStep.ts` — MCP call → step
- `serializeItemAsMcpListToolsRunStep.ts` — MCP list → step
- `serializeItemAsCodeInterpreterCallRunStep.ts` — code interpreter → step
- `serializeItemAsReasoningRunStep.ts` — reasoning → step

### Backported tool contracts (Responses adapter only)

These contracts run against `responsesStorageAdapter` only (not baseline, since the
Assistants API doesn't have these tools natively):

| Contract | What it validates |
|----------|-------------------|
| `computer_call round-trip` | computer tool → requires_action with `computer_call` type → submit screenshot → completion |
| `computer_call batched actions` | New format: multiple actions in single call |
| `computer_call single action` | Legacy format: single action |
| `web_search call` | web_search tool → completed with search results in step |
| `image_generation call` | image gen tool → completed with image URL in message content |
| `mcp call` | MCP server tool → function-like call/output cycle |
| `code_interpreter container` | Responses API code interpreter with container config |

## Current Status

### Baseline (37/37 ✔)

All contracts pass against the real OpenAI Assistants API:

**CRUD (11):** create/retrieve/update/delete/list for assistants, threads, messages
**Run lifecycle (3):** simple poll, simple stream, multi-turn conversation
**Tool calls (10):** function round-trip (poll + stream), file search, code interpreter, parallel calls, no-args, complex args, multiple rounds, output preserved, continue after tool call
**Data integrity (13):** metadata round-trip, content preserved, run_id linkage, thread_id consistency, message-step linkage, list ordering (desc + asc), pagination with cursor, empty thread, run retrieve, stream delta accumulation, cancel run, special chars in tool output

### Adapter targets (not yet implemented)

- [ ] `targets/responses.test.ts` — responsesStorageAdapter (all 37 + backported tools)
- [ ] `targets/prisma-openai.test.ts` — prismaStorageAdapter + OpenAI client
- [ ] `targets/prisma-anthropic.test.ts` — prismaStorageAdapter + Anthropic client
- [ ] `targets/prisma-google.test.ts` — prismaStorageAdapter + Google client
- [ ] `targets/azure-responses.test.ts` — azureResponsesStorageAdapter
- [ ] `targets/azure-agents.test.ts` — azureAgentsStorageAdapter

## Coverage Matrix

### API Method Coverage

| Method | Baseline | Contract | Responses adapter | Prisma adapter |
|--------|:--------:|----------|:-----------------:|:--------------:|
| `assistants.create` | ✔ | `crud: create assistant` | handles | handles |
| `assistants.retrieve` | ✔ | `crud: retrieve assistant` | passthrough | handles |
| `assistants.update` | ✔ | `crud: update assistant` | passthrough | handles |
| `assistants.delete` | ✔ | `crud: delete assistant` | passthrough | handles |
| `assistants.list` | ✔ | `crud: list assistants` | passthrough | handles |
| `threads.create` | ✔ | `crud: create thread` | handles | handles |
| `threads.retrieve` | ✔ | `crud: retrieve thread` | passthrough | handles |
| `threads.update` | ✔ | `crud: update thread` | passthrough | handles |
| `threads.delete` | ✔ | cleanup only | passthrough | handles |
| `messages.create` | ✔ | `crud: create message` | handles | handles |
| `messages.list` | ✔ | `crud: list messages` + pagination | handles | handles |
| `messages.retrieve` | ✔ | `crud: retrieve message` | **not handled** | handles |
| `messages.update` | — | not tested | **not handled** | handles |
| `messages.delete` | — | not tested | **not handled** | handles |
| `runs.create` (stream) | ✔ | `run: simple stream` + tool stream | handles | handles |
| `runs.createAndPoll` | ✔ | `run: simple poll` + tool poll | handles | handles |
| `runs.retrieve` | ✔ | `data: run retrieve` | handles | handles |
| `runs.list` | — | not tested | **not handled** | handles |
| `runs.update` | — | not tested | **not handled** | handles |
| `runs.cancel` | ✔ | `data: cancel run` | passthrough | handles |
| `runs.submitToolOutputs` (stream) | ✔ | `tools: round-trip stream` | handles | handles |
| `runs.submitToolOutputsAndPoll` | ✔ | `tools: round-trip poll` | handles | handles |
| `steps.list` | ✔ | multiple contracts | handles | handles |
| `steps.retrieve` | — | not tested | **not handled** | handles |
| `createThreadAndRun` | — | not tested | **not handled** | handles |

### Tool Type Coverage

| Tool | Baseline | Responses adapter | Prisma + completions | Notes |
|------|:--------:|:-----------------:|:--------------------:|-------|
| `function` (basic) | ✔ | via supercompat | via Anthropic/Google/etc | Core tool type |
| `function` (parallel) | ✔ | via supercompat | depends on model | Multiple simultaneous calls |
| `function` (no args) | ✔ | via supercompat | via adapters | Empty parameters |
| `function` (complex args) | ✔ | via supercompat | via adapters | Nested objects/arrays |
| `function` (multi-round) | ✔ | via supercompat | via adapters | Sequential tool calls |
| `code_interpreter` | ✔ | native + backported | native | Logs + file output |
| `file_search` | ✔ | native + backported | native | Vector store + annotations |
| `computer_call` | — | backported (new) | via Anthropic adapter | Screenshot round-trip |
| `web_search` | — | backported | via Anthropic adapter | Search results |
| `image_generation` | — | backported | N/A | Image URL output |
| `mcp` | — | backported | N/A | MCP server tools |

### Stream Event Coverage

| Event | Tested in baseline | Validates shape | Validates data |
|-------|:------------------:|:---------------:|:--------------:|
| `thread.run.created` | ✔ | ✔ Run shape | ✔ status='in_progress' |
| `thread.run.in_progress` | ✔ | ✔ | — |
| `thread.run.requires_action` | ✔ | ✔ Run shape | ✔ tool_calls present |
| `thread.run.completed` | ✔ | ✔ Run shape | ✔ status='completed' |
| `thread.run.failed` | — | — | — |
| `thread.run.cancelled` | — | — | — |
| `thread.run.step.created` | ✔ | ✔ event name | — |
| `thread.run.step.delta` | ✔ | ✔ event name | — |
| `thread.run.step.completed` | ✔ | ✔ event name | — |
| `thread.message.created` | ✔ | ✔ event name | — |
| `thread.message.delta` | ✔ | ✔ | ✔ text accumulation |
| `thread.message.completed` | ✔ | ✔ Message shape | ✔ content present |

### Data Integrity Coverage

| Invariant | Tested | Contract |
|-----------|:------:|----------|
| Metadata preserved on create → retrieve | ✔ | `data: metadata round-trip` |
| Message text preserved exactly (unicode, emoji, newlines) | ✔ | `data: message content preserved` |
| Assistant message.run_id = run.id | ✔ | `data: run_id on message` |
| User message.run_id = null | ✔ | `data: run_id on message` |
| All objects share thread_id | ✔ | `data: thread_id consistency` |
| Steps share run_id | ✔ | `data: thread_id consistency` |
| message_creation step → message.id | ✔ | `data: message-step linkage` |
| Tool output preserved in step | ✔ | `tools: output preserved in step` |
| Special chars in tool output preserved | ✔ | `data: special chars in tool output` |
| List desc = newest first | ✔ | `data: list order desc` |
| List asc = oldest first | ✔ | `data: list order asc` |
| Pagination with after cursor | ✔ | `data: pagination with cursor` |
| Empty thread = empty list | ✔ | `data: empty thread messages` |
| Run retrieve = poll result | ✔ | `data: run retrieve after completion` |
| Stream deltas = final text | ✔ | `data: stream delta accumulation` |
| Cancel sets status cancelled | ✔ | `data: cancel run` |

### Known Gaps (low priority)

| Gap | Why low priority |
|-----|-----------------|
| `messages.update` | Rarely used in practice — only for metadata |
| `messages.delete` | Rarely used |
| `runs.list` | Rarely used — apps track run IDs directly |
| `runs.update` | Only for metadata |
| `steps.retrieve` | Individual step retrieve rarely used — list is sufficient |
| `createThreadAndRun` | Convenience method — same as create thread + create run |
| `thread.run.failed` stream event | Hard to trigger deterministically |

## Key Design Decisions

1. **Contracts are provider-agnostic** — they use `ctx.model` so the same test works with GPT, Claude, Gemini
2. **No mocking** — every test hits real APIs. Costs money but catches real incompatibilities.
3. **Cleanup is mandatory** — every contract cleans up after itself to avoid state leakage
4. **Flakiness is addressed by instructions** — tool-dependent tests use strong instructions + specific prompts to ensure deterministic model behavior
5. **IDs/timestamps are never compared across targets** — only structural equivalence
6. **Tests fail fast with clear messages** — every assertion includes context about what was expected vs actual
