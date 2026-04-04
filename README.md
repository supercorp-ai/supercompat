# Supercompat

**Use any AI provider with the OpenAI Assistants API or Responses API**

Supercompat is a universal adapter that lets you use OpenAI's Assistants API or Responses API with any AI provider — Anthropic, Google, Groq, Mistral, Azure, OpenRouter, and more. Switch between API outputs by changing a single import path.

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
npm install @prisma/client           # Prisma storage
```

Providers with OpenAI-compatible APIs (Together AI, Perplexity, Ollama) need only the `openai` package pointed at their base URL.

## Quick Start

### Responses API

```typescript
import {
  createClient,
  anthropicClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from 'supercompat/openaiResponses'
import { PrismaClient } from '@prisma/client'
import Anthropic from '@anthropic-ai/sdk'

const client = createClient({
  client: anthropicClientAdapter({ anthropic: new Anthropic() }),
  storage: prismaStorageAdapter({ prisma: new PrismaClient() }),
  runAdapter: completionsRunAdapter(),
})

// Standard OpenAI Responses API — backed by Claude
const response = await client.responses.create({
  model: 'claude-sonnet-4-20250514',
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
  createClient,
  groqClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from 'supercompat/openaiAssistants'
import { PrismaClient } from '@prisma/client'
import Groq from 'groq-sdk'

const client = createClient({
  client: groqClientAdapter({ groq: new Groq() }),
  storage: prismaStorageAdapter({ prisma: new PrismaClient() }),
  runAdapter: completionsRunAdapter(),
})

// Standard OpenAI Assistants API — backed by Groq
const thread = await client.beta.threads.create()
await client.beta.threads.messages.create(thread.id, {
  role: 'user',
  content: 'What is the capital of France?',
})

const run = await client.beta.threads.runs.createAndPoll(thread.id, {
  assistant_id: 'your-assistant-id',
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

**Client adapters** translate between provider SDKs and the OpenAI format. **Storage adapters** persist threads, messages, runs, and responses. **Run adapters** control how model calls are executed — via Chat Completions or native provider APIs.

The import path determines the output format:

```typescript
// Responses API output
import { createClient, prismaStorageAdapter } from 'supercompat/openaiResponses'

// Assistants API output
import { createClient, prismaStorageAdapter } from 'supercompat/openaiAssistants'
```

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
import { createClient, anthropicClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat/openaiResponses'
import Anthropic from '@anthropic-ai/sdk'

const client = createClient({
  client: anthropicClientAdapter({ anthropic: new Anthropic() }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

### Google Gemini

```typescript
import { createClient, googleClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat/openaiResponses'
import { GoogleGenAI } from '@google/genai'

const client = createClient({
  client: googleClientAdapter({ google: new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY }) }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

### Groq

```typescript
import { createClient, groqClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat/openaiResponses'
import Groq from 'groq-sdk'

const client = createClient({
  client: groqClientAdapter({ groq: new Groq() }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

### Mistral

```typescript
import { createClient, mistralClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat/openaiResponses'
import { Mistral } from '@mistralai/mistralai'

const client = createClient({
  client: mistralClientAdapter({ mistral: new Mistral({ apiKey: process.env.MISTRAL_API_KEY }) }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

### OpenAI

```typescript
import { createClient, openaiClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat/openaiResponses'
import OpenAI from 'openai'

const client = createClient({
  client: openaiClientAdapter({ openai: new OpenAI() }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

### Azure OpenAI

```typescript
import { createClient, azureOpenaiClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat/openaiResponses'
import { AzureOpenAI } from 'openai'

const client = createClient({
  client: azureOpenaiClientAdapter({
    azureOpenai: new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiVersion: '2024-02-15-preview',
    }),
  }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

### Azure AI Agents

```typescript
import { supercompat, azureAiProjectClientAdapter, azureAgentsStorageAdapter, azureAgentsRunAdapter } from 'supercompat/openaiAssistants'
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
import { createClient, openRouterClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat/openaiResponses'
import { OpenRouter } from '@openrouter/sdk'

const client = createClient({
  client: openRouterClientAdapter({ openRouter: new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY }) }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

### Together AI

```typescript
import { createClient, togetherClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat/openaiResponses'
import OpenAI from 'openai'

const client = createClient({
  client: togetherClientAdapter({
    together: new OpenAI({ apiKey: process.env.TOGETHER_API_KEY, baseURL: 'https://api.together.xyz/v1' }),
  }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

### Perplexity

```typescript
import { createClient, perplexityClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat/openaiResponses'
import OpenAI from 'openai'

const client = createClient({
  client: perplexityClientAdapter({
    perplexity: new OpenAI({ apiKey: process.env.PERPLEXITY_API_KEY, baseURL: 'https://api.perplexity.ai' }),
  }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

### Ollama (Local)

```typescript
import { createClient, ollamaClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat/openaiResponses'
import OpenAI from 'openai'

const client = createClient({
  client: ollamaClientAdapter({
    ollama: new OpenAI({ apiKey: 'ollama', baseURL: 'http://localhost:11434/v1' }),
  }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

</details>

## Run Adapters

Run adapters control how model calls are executed. The `completionsRunAdapter` works with any provider via Chat Completions. Native run adapters call provider APIs directly, unlocking built-in tools like web search, code interpreter, and computer use.

### Responses API Run Adapters

| Run Adapter | Import | Provider | Function Tools | Web Search | File Search | Code Interpreter | Computer Use |
|---|---|---|---|---|---|---|---|
| `completionsRunAdapter` | `openaiResponses` | Any | Yes | — | — | — | — |
| `anthropicRunAdapter` | `openaiResponses` | Anthropic | Yes | Yes | — | Yes | Yes |
| `geminiRunAdapter` | `openaiResponses` | Google | Yes | — | — | — | Yes |
| `azureAgentsResponsesRunAdapter` | `openaiResponses` | Azure | Yes | — | Yes | Yes | — |
| `openaiResponsesRunAdapter` | `openaiResponses` | OpenAI | Yes | Yes | Yes | Yes | Yes |
| `azureResponsesRunAdapter` | `openaiResponses` | Azure | Yes | Yes | — | Yes | — |

```typescript
// Any provider — function tools via Chat Completions
import { completionsRunAdapter } from 'supercompat/openaiResponses'

// Anthropic — native web search, code execution, computer use
import { anthropicRunAdapter } from 'supercompat/openaiResponses'

// Google Gemini — native computer use
import { geminiRunAdapter } from 'supercompat/openaiResponses'

// Azure AI Agents — native file search, code interpreter
import { azureAgentsResponsesRunAdapter } from 'supercompat/openaiResponses'

// OpenAI — native Responses API with all built-in tools
import { openaiResponsesRunAdapter } from 'supercompat/openaiResponses'

// Azure — native Responses API
import { azureResponsesRunAdapter } from 'supercompat/openaiResponses'
```

### Assistants API Run Adapters

| Run Adapter | Import | Provider | Notes |
|---|---|---|---|
| `completionsRunAdapter` | `openaiAssistants` | Any | Function tools via Chat Completions |
| `responsesRunAdapter` | `openaiAssistants` | OpenAI | Delegates to Responses API |
| `azureAgentsRunAdapter` | `openaiAssistants` | Azure | Uses Azure AI Agents service |
| `perplexityAgentRunAdapter` | `openaiAssistants` | Perplexity | Uses `/v1/agent` endpoint |

## Storage Adapters

### Responses API Storage

| Storage Adapter | Import | Backend | Notes |
|---|---|---|---|
| `prismaStorageAdapter` | `openaiResponses` | PostgreSQL (Prisma) | Full conversation, response, and output item persistence |

### Assistants API Storage

| Storage Adapter | Import | Backend | Notes |
|---|---|---|---|
| `prismaStorageAdapter` | `openaiAssistants` | PostgreSQL (Prisma) | Full thread, message, run, and step persistence |
| `responsesStorageAdapter` | `openaiAssistants` | OpenAI Responses API | No database needed; uses OpenAI for storage |
| `azureAgentsStorageAdapter` | `openaiAssistants` | Azure AI Agents | Manages agents, threads, messages, files, vector stores |
| `azureResponsesStorageAdapter` | `openaiAssistants` | Azure AI + Responses API | Hybrid: Azure for threads/files, Responses for runs |

## Responses API Reference

The Responses API output supports these operations:

| Operation | Method |
|---|---|
| Create response | `client.responses.create({ model, input, ... })` |
| Create streaming response | `client.responses.create({ model, input, stream: true })` |
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

Computer use lets models interact with a virtual screen — taking screenshots, clicking, typing, scrolling. Supercompat normalizes computer use across providers into the standard `computer_call` / `computer_call_output` format, regardless of which provider is behind it.

Supported providers: **OpenAI** (gpt-5.4), **Anthropic** (claude-sonnet-4), **Google Gemini** (gemini-3-flash)

```typescript
import { createClient, anthropicClientAdapter, prismaStorageAdapter, anthropicRunAdapter } from 'supercompat/openaiResponses'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()
const client = createClient({
  client: anthropicClientAdapter({ anthropic }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: anthropicRunAdapter({ anthropic }),  // native adapter for computer use
})

const response = await client.responses.create({
  model: 'claude-sonnet-4-20250514',
  input: 'Take a screenshot of the current page.',
  tools: [{ type: 'computer' }],
})

// Same computer_call format regardless of provider
const computerCall = response.output.find(item => item.type === 'computer_call')
// computerCall.actions = [{ type: 'screenshot' }]

// Send the screenshot back
const next = await client.responses.create({
  model: 'claude-sonnet-4-20250514',
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

**Responses API**: 29 contracts across 14 targets — CRUD, streaming, function tools, built-in tools, conversations, structured output, truncation, and parameter handling.

**Assistants API**: 48 contracts across 15 targets — assistant CRUD, thread/message lifecycle, run polling and streaming, tool calls, pagination, and metadata.

Each target is a unique combination of client adapter + storage adapter + run adapter, tested against the same contracts. The baseline target runs against the real OpenAI API to establish ground truth.

## License

MIT

---

Made by [Supercorp](https://supercorp.ai)
