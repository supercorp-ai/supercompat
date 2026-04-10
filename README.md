# Supercompat

**Use any AI provider with the OpenAI Assistants API or Responses API**

Supercompat is a universal adapter that lets you use OpenAI's Assistants API or Responses API with any AI provider — Anthropic, Google, Groq, Mistral, Azure, OpenRouter, and more.

## Installation

```bash
npm install supercompat openai
```

Then install the SDK for whichever providers you need:

```bash
npm install @anthropic-ai/sdk       # Anthropic (Claude)
npm install @google/genai            # Google Gemini
npm install groq-sdk                 # Groq
npm install @mistralai/mistralai     # Mistral
npm install @openrouter/sdk          # OpenRouter (200+ models)
npm install @azure/ai-projects       # Azure AI Agents
npm install @prisma/client           # Prisma storage (optional)
```

Providers with OpenAI-compatible APIs (Together AI, Perplexity, Ollama) need only the `openai` package pointed at their base URL.

## Quick Start

The fastest way to get started — no database required:

### Responses API

```typescript
import {
  supercompat,
  anthropicClientAdapter,
  memoryStorageAdapter,
  completionsRunAdapter,
} from 'supercompat/openai'
import Anthropic from '@anthropic-ai/sdk'

const client = supercompat({
  client: anthropicClientAdapter({ anthropic: new Anthropic() }),
  storage: memoryStorageAdapter(),
  runAdapter: completionsRunAdapter(),
})

// Standard OpenAI Responses API — backed by Claude
const response = await client.responses.create({
  model: 'claude-sonnet-4-6-20250603',
  input: 'What is the capital of France?',
  stream: true,
})

for await (const event of response) {
  if (event.type === 'response.output_text.delta') {
    process.stdout.write(event.delta)
  }
}
```

### Assistants API

```typescript
import {
  supercompat,
  groqClientAdapter,
  memoryStorageAdapter,
  completionsRunAdapter,
} from 'supercompat/openai'
import Groq from 'groq-sdk'

const client = supercompat({
  client: groqClientAdapter({ groq: new Groq() }),
  storage: memoryStorageAdapter(),
  runAdapter: completionsRunAdapter(),
})

// Standard OpenAI Assistants API — backed by Groq
const assistant = await client.beta.assistants.create({
  model: 'llama-3.3-70b-versatile',
  instructions: 'Be concise.',
})

const thread = await client.beta.threads.create()
await client.beta.threads.messages.create(thread.id, {
  role: 'user',
  content: 'What is the capital of France?',
})

const run = await client.beta.threads.runs.createAndPoll(thread.id, {
  assistant_id: assistant.id,
})
```

## Architecture

Every supercompat client is assembled from three adapters:

```
Client Adapter          Storage Adapter         Run Adapter
(talks to the LLM)      (persists state)        (executes runs)
       │                       │                       │
       └───────────┬───────────┘───────────────────────┘
                   │
            ┌──────┴──────┐
            │  supercompat │──▶  OpenAI Responses API
            │             │──▶  OpenAI Assistants API
            └─────────────┘
```

**Client adapters** translate between provider SDKs and the OpenAI format. **Storage adapters** persist threads, messages, runs, and responses. **Run adapters** control how model calls are executed.

## Providers

| Provider | Client Adapter | SDK | Function Tools | Notes |
|---|---|---|---|---|
| OpenAI | `openaiClientAdapter` | `openai` | Yes | |
| Anthropic | `anthropicClientAdapter` | `@anthropic-ai/sdk` | Yes | |
| Google Gemini | `googleClientAdapter` | `@google/genai` | Yes | |
| Azure OpenAI | `azureOpenaiClientAdapter` | `openai` | Yes | |
| Azure AI Agents | `azureAiProjectClientAdapter` | `@azure/ai-projects` | Yes | Use with `azureAgents` run/storage adapters |
| Groq | `groqClientAdapter` | `groq-sdk` | Yes | |
| Mistral | `mistralClientAdapter` | `@mistralai/mistralai` | Yes | |
| OpenRouter | `openRouterClientAdapter` | `@openrouter/sdk` | Yes | 200+ models |
| Together AI | `togetherClientAdapter` | `openai` | Yes | OpenAI-compatible API |
| Perplexity | `perplexityClientAdapter` | `openai` | Via agent adapter | No tool support on `/chat/completions` |
| Humiris | `humirisClientAdapter` | `humiris-ai` | Yes | |
| Ollama | `ollamaClientAdapter` | `openai` | Yes | Local models |

<details>
<summary>Provider setup examples</summary>

### Anthropic

```typescript
import { supercompat, anthropicClientAdapter, memoryStorageAdapter, completionsRunAdapter } from 'supercompat/openai'
import Anthropic from '@anthropic-ai/sdk'

const client = supercompat({
  client: anthropicClientAdapter({ anthropic: new Anthropic() }),
  storage: memoryStorageAdapter(),
  runAdapter: completionsRunAdapter(),
})
```

### Google Gemini

```typescript
import { supercompat, googleClientAdapter, memoryStorageAdapter, completionsRunAdapter } from 'supercompat/openai'
import { GoogleGenAI } from '@google/genai'

const client = supercompat({
  client: googleClientAdapter({ google: new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY }) }),
  storage: memoryStorageAdapter(),
  runAdapter: completionsRunAdapter(),
})
```

### Groq

```typescript
import { supercompat, groqClientAdapter, memoryStorageAdapter, completionsRunAdapter } from 'supercompat/openai'
import Groq from 'groq-sdk'

const client = supercompat({
  client: groqClientAdapter({ groq: new Groq() }),
  storage: memoryStorageAdapter(),
  runAdapter: completionsRunAdapter(),
})
```

### Mistral

```typescript
import { supercompat, mistralClientAdapter, memoryStorageAdapter, completionsRunAdapter } from 'supercompat/openai'
import { Mistral } from '@mistralai/mistralai'

const client = supercompat({
  client: mistralClientAdapter({ mistral: new Mistral({ apiKey: process.env.MISTRAL_API_KEY }) }),
  storage: memoryStorageAdapter(),
  runAdapter: completionsRunAdapter(),
})
```

### OpenAI

```typescript
import { supercompat, openaiClientAdapter, memoryStorageAdapter, completionsRunAdapter } from 'supercompat/openai'
import OpenAI from 'openai'

const client = supercompat({
  client: openaiClientAdapter({ openai: new OpenAI() }),
  storage: memoryStorageAdapter(),
  runAdapter: completionsRunAdapter(),
})
```

### Azure OpenAI

```typescript
import { supercompat, azureOpenaiClientAdapter, memoryStorageAdapter, completionsRunAdapter } from 'supercompat/openai'
import { AzureOpenAI } from 'openai'

const client = supercompat({
  client: azureOpenaiClientAdapter({
    azureOpenai: new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiVersion: '2024-02-15-preview',
    }),
  }),
  storage: memoryStorageAdapter(),
  runAdapter: completionsRunAdapter(),
})
```

### Azure AI Agents

```typescript
import { supercompat, azureAiProjectClientAdapter, azureAgentsStorageAdapter, azureAgentsRunAdapter } from 'supercompat/openai'
import { AIProjectClient } from '@azure/ai-projects'
import { ClientSecretCredential } from '@azure/identity'

const credential = new ClientSecretCredential(tenantId, clientId, clientSecret)
const azureAiProject = new AIProjectClient(endpoint, credential)

const client = supercompat({
  client: azureAiProjectClientAdapter({ azureAiProject }),
  storage: azureAgentsStorageAdapter({ azureAiProject, prisma }),
  runAdapter: azureAgentsRunAdapter({ azureAiProject }),
})
```

### OpenRouter

```typescript
import { supercompat, openRouterClientAdapter, memoryStorageAdapter, completionsRunAdapter } from 'supercompat/openai'
import { OpenRouter } from '@openrouter/sdk'

const client = supercompat({
  client: openRouterClientAdapter({ openRouter: new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY }) }),
  storage: memoryStorageAdapter(),
  runAdapter: completionsRunAdapter(),
})
```

### Together AI

```typescript
import { supercompat, togetherClientAdapter, memoryStorageAdapter, completionsRunAdapter } from 'supercompat/openai'
import OpenAI from 'openai'

const client = supercompat({
  client: togetherClientAdapter({
    together: new OpenAI({ apiKey: process.env.TOGETHER_API_KEY, baseURL: 'https://api.together.xyz/v1' }),
  }),
  storage: memoryStorageAdapter(),
  runAdapter: completionsRunAdapter(),
})
```

### Perplexity

```typescript
import { supercompat, perplexityClientAdapter, memoryStorageAdapter, completionsRunAdapter } from 'supercompat/openai'
import OpenAI from 'openai'

const client = supercompat({
  client: perplexityClientAdapter({
    perplexity: new OpenAI({ apiKey: process.env.PERPLEXITY_API_KEY, baseURL: 'https://api.perplexity.ai' }),
  }),
  storage: memoryStorageAdapter(),
  runAdapter: completionsRunAdapter(),
})
```

### Ollama (Local)

```typescript
import { supercompat, ollamaClientAdapter, memoryStorageAdapter, completionsRunAdapter } from 'supercompat/openai'
import OpenAI from 'openai'

const client = supercompat({
  client: ollamaClientAdapter({
    ollama: new OpenAI({ apiKey: 'ollama', baseURL: 'http://localhost:11434/v1' }),
  }),
  storage: memoryStorageAdapter(),
  runAdapter: completionsRunAdapter(),
})
```

</details>

## Storage Adapters

| Storage Adapter | Backend | Database Required | Notes |
|---|---|---|---|
| `memoryStorageAdapter` | In-memory | No | Zero setup, state lost on restart. Great for development, testing, and stateless workloads. |
| `prismaStorageAdapter` | PostgreSQL (Prisma) | Yes | Full persistence for threads, messages, runs, responses, and conversations. |
| `openaiResponsesStorageAdapter` | OpenAI Responses API | No | No database needed; uses OpenAI for storage. Assistants API only. |
| `azureAgentsStorageAdapter` | Azure AI Agents | No | Manages agents, threads, messages, files, vector stores. |
| `azureResponsesStorageAdapter` | Azure AI + Responses API | No | Hybrid: Azure for threads/files, Responses for runs. |

### Using Prisma storage

Replace `memoryStorageAdapter()` with `prismaStorageAdapter({ prisma })` for persistent storage:

```typescript
import { supercompat, openaiClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat/openai'
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'

const client = supercompat({
  client: openaiClientAdapter({ openai: new OpenAI() }),
  storage: prismaStorageAdapter({ prisma: new PrismaClient() }),
  runAdapter: completionsRunAdapter(),
})
```

See [Database Setup](#database-setup) for the required Prisma schema.

### `openaiResponsesStorageAdapter` options

```typescript
import { openaiResponsesStorageAdapter } from 'supercompat/openai'

openaiResponsesStorageAdapter({
  deferItemCreationUntilRun: true,  // default: false
})
```

When `deferItemCreationUntilRun` is `false` (default), `messages.create()` immediately persists messages to the Responses API via `conversations.items.create()`. When `true`, messages are buffered in memory and only sent when `runs.create()` is called.

## Run Adapters

Run adapters control how model calls are executed. The `completionsRunAdapter` works with any provider via Chat Completions. Native run adapters call provider APIs directly, unlocking built-in tools like web search, code interpreter, and computer use.

### Responses API Run Adapters

| Run Adapter | Provider | Function Tools | Web Search | File Search | Code Interpreter | Computer Use |
|---|---|---|---|---|---|---|
| `completionsRunAdapter` | Any | Yes | — | — | — | — |
| `anthropicRunAdapter` | Anthropic | Yes | Yes | — | Yes | Yes |
| `geminiRunAdapter` | Google | Yes | — | — | — | Yes |
| `azureAgentsResponsesRunAdapter` | Azure | Yes | — | Yes | Yes | — |
| `openaiResponsesRunAdapter` | OpenAI | Yes | Yes | Yes | Yes | Yes |
| `azureResponsesRunAdapter` | Azure | Yes | Yes | — | Yes | — |

### Assistants API Run Adapters

| Run Adapter | Provider | Notes |
|---|---|---|
| `completionsRunAdapter` | Any | Function tools via Chat Completions |
| `openaiResponsesRunAdapter` | OpenAI | Delegates to Responses API |
| `azureResponsesRunAdapter` | Azure | Delegates to Azure Responses API |
| `azureAgentsRunAdapter` | Azure | Uses Azure AI Agents service |
| `perplexityAgentRunAdapter` | Perplexity | Uses `/v1/agent` endpoint |

All adapters are imported from `supercompat/openai`.

## Responses API Reference

| Operation | Method |
|---|---|
| Create response | `client.responses.create({ model, input, ... })` |
| Create streaming response | `client.responses.create({ model, input, stream: true })` |
| Stream helper | `client.responses.stream({ model, input })` |
| Retrieve response | `client.responses.retrieve(id)` |
| Delete response | `client.responses.del(id)` |
| List input items | `client.responses.inputItems.list(id)` |
| Function calling | `tools: [{ type: 'function', ... }]` |
| Function output | `input: [{ type: 'function_call_output', call_id, output }]` |
| Conversations | `conversation: {}` or `previous_response_id` |
| Structured output | `text: { format: { type: 'json_schema', ... } }` |
| Computer use | `tools: [{ type: 'computer' }]` |
| Truncation | `truncation: 'auto'` |
| Tool choice | `tool_choice: 'required'` |

## Assistants API Reference

| Resource | Methods |
|---|---|
| Assistants | `create`, `retrieve`, `update`, `list`, `delete` |
| Threads | `create`, `retrieve`, `update`, `delete` |
| Messages | `create`, `retrieve`, `update`, `list`, `delete` |
| Runs | `create`, `createAndPoll`, `retrieve`, `update`, `list`, `cancel`, `submitToolOutputs`, `submitToolOutputsAndPoll` |
| Run Steps | `list`, `retrieve` |
| Files | `create`, `retrieve`, `delete` |
| Vector Stores | `create`, `retrieve`, `delete` |

## Computer Use

Computer use lets models interact with a virtual screen — taking screenshots, clicking, typing, scrolling. Supercompat normalizes computer use across providers into the standard `computer_call` / `computer_call_output` format.

Supported providers: **OpenAI** (gpt-5.4), **Anthropic** (claude-sonnet-4), **Google Gemini** (gemini-3-flash)

```typescript
import { supercompat, anthropicClientAdapter, memoryStorageAdapter, anthropicRunAdapter } from 'supercompat/openai'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()
const client = supercompat({
  client: anthropicClientAdapter({ anthropic }),
  storage: memoryStorageAdapter(),
  runAdapter: anthropicRunAdapter({ anthropic }),  // native adapter for computer use
})

const response = await client.responses.create({
  model: 'claude-sonnet-4-6-20250603',
  input: 'Take a screenshot of the current page.',
  tools: [{ type: 'computer' }],
})

// Same computer_call format regardless of provider
const computerCall = response.output.find(item => item.type === 'computer_call')

// Send the screenshot back
const next = await client.responses.create({
  model: 'claude-sonnet-4-6-20250603',
  previous_response_id: response.id,
  tools: [{ type: 'computer' }],
  input: [{
    type: 'computer_call_output',
    call_id: computerCall.call_id,
    output: {
      type: 'computer_screenshot',
      image_url: 'data:image/png;base64,...',
    },
  }],
})
```

Provider-native formats are translated automatically:

- **OpenAI** (`gpt-5.4`): native `computer` tool, passed through directly
- **Anthropic** (`claude-sonnet-4`): `computer_20250124` beta tool — coordinate arrays translated to x/y, action strings to typed objects
- **Google Gemini** (`gemini-3-flash`): `computerUse` tool — function calls translated to `computer_call` items

## Database Setup

Database setup is only required when using `prismaStorageAdapter`. If you're using `memoryStorageAdapter`, skip this section.

### Responses API

<details>
<summary>Prisma schema for Responses API</summary>

```prisma
model Conversation {
  id          String     @id @default(dbgenerated("gen_random_uuid()"))
  metadata    Json?
  responses   Response[]
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

enum ResponseStatus {
  QUEUED
  IN_PROGRESS
  COMPLETED
  FAILED
  CANCELLED
  INCOMPLETE
}

enum TruncationType {
  AUTO
  LAST_MESSAGES
  DISABLED
}

model Response {
  id                          String           @id @default(dbgenerated("gen_random_uuid()"))
  conversationId              String?
  conversation                Conversation?    @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  model                       String
  status                      ResponseStatus
  error                       Json?
  metadata                    Json?
  usage                       Json?
  instructions                String?
  temperature                 Float?
  topP                        Float?
  maxOutputTokens             Int?
  truncationType              TruncationType   @default(DISABLED)
  truncationLastMessagesCount Int?
  textFormatType              String?          @default("text")
  textFormatSchema            Json?
  input                       Json?
  outputItems                 ResponseOutputItem[]
  tools                       ResponseTool[]
  createdAt                   DateTime         @default(now())
  updatedAt                   DateTime         @updatedAt

  @@index([conversationId])
}

enum ResponseOutputItemType {
  MESSAGE
  FUNCTION_CALL
  COMPUTER_CALL
}

enum ResponseOutputItemStatus {
  IN_PROGRESS
  COMPLETED
  INCOMPLETE
}

model ResponseOutputItem {
  id                  String                   @id @default(dbgenerated("gen_random_uuid()"))
  responseId          String
  response            Response                 @relation(fields: [responseId], references: [id], onDelete: Cascade)
  type                ResponseOutputItemType
  status              ResponseOutputItemStatus @default(IN_PROGRESS)
  role                String?
  content             Json?
  callId              String?
  name                String?
  arguments           String?
  actions             Json?
  pendingSafetyChecks Json?
  createdAt           DateTime                 @default(now())
  updatedAt           DateTime                 @updatedAt

  @@index([responseId])
  @@index([createdAt(sort: Asc)])
}

enum ResponseToolType {
  FUNCTION
  FILE_SEARCH
  WEB_SEARCH
  CODE_INTERPRETER
  COMPUTER_USE
}

model ResponseTool {
  id                  String              @id @default(dbgenerated("gen_random_uuid()"))
  type                ResponseToolType
  responseId          String
  response            Response            @relation(fields: [responseId], references: [id], onDelete: Cascade)
  functionTool        ResponseFunctionTool?
  fileSearchTool      ResponseFileSearchTool?
  webSearchTool       ResponseWebSearchTool?
  codeInterpreterTool ResponseCodeInterpreterTool?
  computerUseTool     ResponseComputerUseTool?
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt

  @@index([responseId])
}

model ResponseFunctionTool {
  id          String       @id @default(dbgenerated("gen_random_uuid()"))
  name        String
  description String?
  parameters  Json
  strict      Boolean      @default(false)
  toolId      String       @unique
  tool        ResponseTool @relation(fields: [toolId], references: [id], onDelete: Cascade)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
}

model ResponseFileSearchTool {
  id             String       @id @default(dbgenerated("gen_random_uuid()"))
  vectorStoreIds String[]     @default([])
  maxNumResults  Int          @default(20)
  toolId         String       @unique
  tool           ResponseTool @relation(fields: [toolId], references: [id], onDelete: Cascade)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
}

model ResponseWebSearchTool {
  id        String       @id @default(dbgenerated("gen_random_uuid()"))
  toolId    String       @unique
  tool      ResponseTool @relation(fields: [toolId], references: [id], onDelete: Cascade)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
}

model ResponseCodeInterpreterTool {
  id        String       @id @default(dbgenerated("gen_random_uuid()"))
  toolId    String       @unique
  tool      ResponseTool @relation(fields: [toolId], references: [id], onDelete: Cascade)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
}

model ResponseComputerUseTool {
  id            String       @id @default(dbgenerated("gen_random_uuid()"))
  displayHeight Int          @default(720)
  displayWidth  Int          @default(1280)
  environment   String       @default("linux")
  toolId        String       @unique
  tool          ResponseTool @relation(fields: [toolId], references: [id], onDelete: Cascade)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
}
```

</details>

### Assistants API

<details>
<summary>Prisma schema for Assistants API</summary>

```prisma
model Assistant {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  modelSlug    String?
  instructions String?
  name         String?
  description  String?
  metadata     Json?
  threads      Thread[]
  runs         Run[]
  runSteps     RunStep[]
  messages     Message[]
  createdAt    DateTime  @default(now()) @db.Timestamptz(6)
  updatedAt    DateTime  @updatedAt @db.Timestamptz(6)
}

model Thread {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  assistantId String    @db.Uuid
  assistant   Assistant @relation(fields: [assistantId], references: [id], onDelete: Cascade)
  metadata    Json?
  messages    Message[]
  runs        Run[]
  runSteps    RunStep[]
  createdAt   DateTime  @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime  @updatedAt @db.Timestamptz(6)

  @@index([assistantId])
  @@index([createdAt(sort: Desc)])
}

enum MessageRole {
  USER
  ASSISTANT
}

enum MessageStatus {
  IN_PROGRESS
  INCOMPLETE
  COMPLETED
}

model Message {
  id                String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  threadId          String        @db.Uuid
  thread            Thread        @relation(fields: [threadId], references: [id], onDelete: Cascade)
  role              MessageRole
  content           Json
  status            MessageStatus @default(COMPLETED)
  assistantId       String?       @db.Uuid
  assistant         Assistant?    @relation(fields: [assistantId], references: [id], onDelete: Cascade)
  runId             String?       @db.Uuid
  run               Run?          @relation(fields: [runId], references: [id], onDelete: Cascade)
  completedAt       DateTime?     @db.Timestamptz(6)
  incompleteAt      DateTime?     @db.Timestamptz(6)
  incompleteDetails Json?
  attachments       Json[]        @default([])
  metadata          Json?
  toolCalls         Json?
  createdAt         DateTime      @default(now()) @db.Timestamptz(6)
  updatedAt         DateTime      @updatedAt @db.Timestamptz(6)

  @@index([threadId])
  @@index([createdAt(sort: Desc)])
}

enum RunStatus {
  QUEUED
  IN_PROGRESS
  REQUIRES_ACTION
  CANCELLING
  CANCELLED
  FAILED
  COMPLETED
  EXPIRED
}

model Run {
  id                  String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  threadId            String    @db.Uuid
  thread              Thread    @relation(fields: [threadId], references: [id], onDelete: Cascade)
  assistantId         String    @db.Uuid
  assistant           Assistant @relation(fields: [assistantId], references: [id], onDelete: Cascade)
  status              RunStatus
  requiredAction      Json?
  lastError           Json?
  expiresAt           Int
  startedAt           Int?
  cancelledAt         Int?
  failedAt            Int?
  completedAt         Int?
  model               String
  instructions        String
  tools               Json[]    @default([])
  metadata            Json?
  usage               Json?
  truncationStrategy  Json      @default("{ \"type\": \"auto\" }")
  responseFormat      Json      @default("{ \"type\": \"text\" }")
  runSteps            RunStep[]
  messages            Message[]
  createdAt           DateTime  @default(now()) @db.Timestamptz(6)
  updatedAt           DateTime  @updatedAt @db.Timestamptz(6)
}

enum RunStepType {
  MESSAGE_CREATION
  TOOL_CALLS
}

enum RunStepStatus {
  IN_PROGRESS
  CANCELLED
  FAILED
  COMPLETED
  EXPIRED
}

model RunStep {
  id          String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  threadId    String        @db.Uuid
  thread      Thread        @relation(fields: [threadId], references: [id], onDelete: Cascade)
  assistantId String        @db.Uuid
  assistant   Assistant     @relation(fields: [assistantId], references: [id], onDelete: Cascade)
  runId       String        @db.Uuid
  run         Run           @relation(fields: [runId], references: [id], onDelete: Cascade)
  type        RunStepType
  status      RunStepStatus
  stepDetails Json
  lastError   Json?
  expiredAt   Int?
  cancelledAt Int?
  failedAt    Int?
  completedAt Int?
  metadata    Json?
  usage       Json?
  createdAt   DateTime      @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime      @updatedAt @db.Timestamptz(6)

  @@index([threadId, runId, type, status])
  @@index([createdAt(sort: Asc)])
}
```

</details>

### Azure AI Agents

Azure storage adapters require an additional model for persisting function tool outputs:

```prisma
model AzureAgentsFunctionOutput {
  id           String   @id @default(dbgenerated("gen_random_uuid()"))
  runId        String
  toolCallId   String
  output       String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([runId, toolCallId])
  @@index([runId])
}
```

After adding the schema, run:

```bash
npx prisma db push
npx prisma generate
```

## Conformance Testing

Supercompat ships with conformance tests that verify adapter behavior against the real OpenAI APIs.

**Responses API**: 25 contracts covering CRUD, streaming, function tools, conversations, structured output, truncation, and parameter handling.

**Assistants API**: 39 contracts covering assistant CRUD, thread/message lifecycle, run polling and streaming, tool calls (parallel, no-arg, complex args, multi-round), pagination, metadata, and cancel/resume.

Each adapter combination is tested against the same contracts across all supported providers. The memory storage adapter is tested with 8 providers (OpenAI, Anthropic, Google Gemini, Groq, Mistral, OpenRouter, Together AI, Perplexity). The Prisma storage adapter is tested with the same provider matrix.

## License

MIT

---

Made by [Supercorp](https://supercorp.ai)
