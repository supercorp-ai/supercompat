# Supercompat

**Use any AI provider with the OpenAI Assistants API or Responses API**

Supercompat is a universal adapter that lets you use OpenAI's Assistants API or Responses API with any AI provider (Anthropic, Groq, Mistral, Azure, Google, and more). Switch between APIs by changing a single import path.

## Features

- **Two API Surfaces** - Output as OpenAI Assistants API or Responses API, switchable via import path
- **Universal AI Provider Support** - Works with OpenAI, Anthropic, Groq, Mistral, Azure, Google, OpenRouter, Perplexity, Together AI, Ollama, and more
- **Flexible Storage** - Use Prisma with your own database, OpenAI's Responses API, or Azure AI Agents
- **Plug-and-Play Architecture** - Mix and match client adapters, storage adapters, and run adapters
- **Streaming Support** - Real-time streaming responses for all providers
- **Tool Calling** - Function calling support across providers
- **Conversations** - Multi-turn conversation tracking with the Responses API surface
- **Type-Safe** - Full TypeScript support with OpenAI's types

## Installation

```bash
npm install supercompat openai
```

Depending on which providers you want to use, install the corresponding SDK:

```bash
# For Anthropic
npm install @anthropic-ai/sdk

# For Groq
npm install groq-sdk

# For Mistral
npm install @mistralai/mistralai

# For Azure AI Agents
npm install @azure/ai-projects @azure/identity

# For Google Gemini
npm install @google/genai

# For OpenRouter (access 200+ models via one API)
npm install @openrouter/sdk

# For Perplexity, Together AI, Ollama, etc.
# (These use OpenAI-compatible APIs, no additional SDK needed)

# For Prisma storage
npm install @prisma/client
```

## Quick Start

### Responses API (Recommended)

```typescript
import { createClient, openaiClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat/openaiResponses'
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'

const prisma = new PrismaClient()
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const client = createClient({
  client: openaiClientAdapter({ openai }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})

// Use it like OpenAI's Responses API
const response = await client.responses.create({
  model: 'gpt-4o',
  input: 'What is the capital of France?',
})

console.log(response.output)
```

### Assistants API

```typescript
import { createClient, groqClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat/openaiAssistants'
import { PrismaClient } from '@prisma/client'
import Groq from 'groq-sdk'

const prisma = new PrismaClient()
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const client = createClient({
  client: groqClientAdapter({ groq }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})

// Use it like OpenAI's Assistants API
const thread = await client.beta.threads.create()
await client.beta.threads.messages.create(thread.id, {
  role: 'user',
  content: 'What is the capital of France?',
})

const run = await client.beta.threads.runs.createAndPoll(thread.id, {
  assistant_id: 'your-assistant-id',
})
```

### Switching Between APIs

The two API surfaces share the same client adapters, run adapters, and configuration. Switch by changing the import path:

```typescript
// Responses API
import { createClient, prismaStorageAdapter, completionsRunAdapter } from 'supercompat/openaiResponses'

// Assistants API
import { createClient, prismaStorageAdapter, completionsRunAdapter } from 'supercompat/openaiAssistants'
```

Each path exports its own `prismaStorageAdapter` with the appropriate Prisma models. Client adapters and run adapters are shared.

## Architecture

Supercompat uses a modular architecture with three types of adapters:

```
┌──────────────────────────┐
│  Client Adapter          │────┐
│  • Anthropic             │    │
│  • Groq                  │    │
│  • OpenAI                │    │
│  • OpenRouter            │    │
│  • Mistral, etc.         │    │
└──────────────────────────┘    │
                                │     ┌─────────────────┐      ┌──────────────────────┐
┌──────────────────────────┐    │     │                 │      │  Responses API       │
│  Storage Adapter         │────┼────▶│   Supercompat   │─────▶│  — or —              │
│  • Prisma (Database)     │    │     │                 │      │  Assistants API      │
│  • Responses API         │    │     └─────────────────┘      └──────────────────────┘
│  • Azure AI Agents       │────┘
└──────────────────────────┘    │
                                │
┌──────────────────────────┐    │
│  Run Adapter             │────┘
│  • completions           │
│  • responses             │
│  • azureAgents           │
└──────────────────────────┘
```

1. **Client Adapters** - Interface with any AI provider (Anthropic, Groq, OpenAI, Mistral, etc.)
2. **Storage Adapters** - Persist data using your preferred backend (Prisma/Database, OpenAI Responses API, Azure AI Agents)
3. **Run Adapters** - Execute runs using different strategies (completions, responses, azureAgents)

The import path (`supercompat/openaiResponses` or `supercompat/openaiAssistants`) determines the output API format.

## Responses API

Import from `supercompat/openaiResponses` to get an OpenAI Responses API compatible interface.

### Basic Usage

```typescript
import { createClient, openaiClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat/openaiResponses'

const client = createClient({
  client: openaiClientAdapter({ openai }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})

// Non-streaming
const response = await client.responses.create({
  model: 'gpt-4o',
  input: 'What is the capital of France?',
})
console.log(response.output)

// Streaming
const stream = await client.responses.create({
  model: 'gpt-4o',
  input: 'Tell me a story',
  stream: true,
})

for await (const event of stream) {
  if (event.type === 'response.output_text.delta') {
    process.stdout.write(event.delta)
  }
}
```

### Conversations

Track multi-turn conversations by passing a `conversation` parameter:

```typescript
// First turn
const response1 = await client.responses.create({
  model: 'gpt-4o',
  input: 'My name is Alice.',
  conversation: {},  // auto-create a new conversation
})

// Second turn — uses previous context
const response2 = await client.responses.create({
  model: 'gpt-4o',
  input: 'What is my name?',
  conversation: response1.conversation!.id,
})
```

### Function Calling

```typescript
const response = await client.responses.create({
  model: 'gpt-4o',
  input: 'What is the weather in Paris?',
  tools: [{
    type: 'function',
    name: 'get_weather',
    description: 'Get the current weather for a location',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string' },
      },
      required: ['location'],
      additionalProperties: false,
    },
  }],
})

// Find function call in output
const functionCall = response.output.find((item: any) => item.type === 'function_call')

// Submit tool output
const finalResponse = await client.responses.create({
  model: 'gpt-4o',
  input: [
    ...response.input,
    functionCall,
    {
      type: 'function_call_output',
      call_id: functionCall.call_id,
      output: JSON.stringify({ temperature: 18, condition: 'cloudy' }),
    },
  ],
})
```

### Retrieve and Delete

```typescript
// Retrieve a response by ID
const retrieved = await client.responses.retrieve(response.id)

// List input items
const inputItems = await client.responses.inputItems.list(response.id)

// Delete a response
await client.responses.del(response.id)
```

### Streaming Events

The Responses API surface emits these streaming events:

- `response.created`
- `response.in_progress`
- `response.output_item.added`
- `response.output_text.delta`
- `response.output_text.done`
- `response.output_item.done`
- `response.function_call_arguments.delta`
- `response.function_call_arguments.done`
- `response.completed`
- `response.failed`

### Database Setup (Responses API)

Add the following models to your Prisma schema:

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
}

enum ResponseOutputItemStatus {
  IN_PROGRESS
  COMPLETED
  INCOMPLETE
}

model ResponseOutputItem {
  id          String                   @id @default(dbgenerated("gen_random_uuid()"))
  responseId  String
  response    Response                 @relation(fields: [responseId], references: [id], onDelete: Cascade)
  type        ResponseOutputItemType
  status      ResponseOutputItemStatus @default(IN_PROGRESS)
  role        String?
  content     Json?
  callId      String?
  name        String?
  arguments   String?
  createdAt   DateTime                 @default(now())
  updatedAt   DateTime                 @updatedAt

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
  id          String       @id @default(dbgenerated("gen_random_uuid()"))
  toolId      String       @unique
  tool        ResponseTool @relation(fields: [toolId], references: [id], onDelete: Cascade)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
}

model ResponseCodeInterpreterTool {
  id          String       @id @default(dbgenerated("gen_random_uuid()"))
  toolId      String       @unique
  tool        ResponseTool @relation(fields: [toolId], references: [id], onDelete: Cascade)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
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

Then run:

```bash
npx prisma db push
npx prisma generate
```

## Assistants API

Import from `supercompat/openaiAssistants` (or the root `supercompat` path) to get an OpenAI Assistants API compatible interface.

### Basic Usage

```typescript
import { createClient, groqClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat/openaiAssistants'

const client = createClient({
  client: groqClientAdapter({ groq }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})

const thread = await client.beta.threads.create()
await client.beta.threads.messages.create(thread.id, {
  role: 'user',
  content: 'What is the weather like today?',
})

const run = await client.beta.threads.runs.createAndPoll(thread.id, {
  assistant_id: 'asst_abc123',
})

const messages = await client.beta.threads.messages.list(thread.id)
console.log(messages.data[0].content)
```

### Streaming

```typescript
const run = await client.beta.threads.runs.create(thread.id, {
  assistant_id: 'asst_abc123',
  stream: true,
})

for await (const event of run) {
  if (event.event === 'thread.message.delta') {
    const delta = event.data.delta.content?.[0]
    if (delta?.type === 'text') {
      process.stdout.write(delta.text.value)
    }
  }
}
```

### Function Calling

```typescript
const assistant = await client.beta.assistants.create({
  model: 'llama-3.3-70b-versatile',
  tools: [{
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get the current weather for a location',
      parameters: {
        type: 'object',
        properties: { location: { type: 'string' } },
        required: ['location'],
      },
    },
  }],
})

const run = await client.beta.threads.runs.createAndPoll(thread.id, {
  assistant_id: assistant.id,
})

if (run.status === 'requires_action') {
  const toolCalls = run.required_action?.submit_tool_outputs.tool_calls || []
  const toolOutputs = toolCalls.map((toolCall) => ({
    tool_call_id: toolCall.id,
    output: JSON.stringify({ temperature: 72, condition: 'sunny' }),
  }))

  await client.beta.threads.runs.submitToolOutputsAndPoll(run.id, {
    thread_id: thread.id,
    tool_outputs: toolOutputs,
  })
}
```

### Database Setup (Assistants API)

Add the following models to your Prisma schema:

```prisma
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
```

Then run:

```bash
npx prisma db push
npx prisma generate
```

### Supported Endpoints

**Assistants:**
- `beta.assistants.create()` / `retrieve()` / `update()` / `list()` / `delete()`

**Threads:**
- `beta.threads.create()` / `retrieve()` / `update()` / `delete()`

**Messages:**
- `beta.threads.messages.create()` / `retrieve()` / `update()` / `list()` / `delete()`

**Runs:**
- `beta.threads.runs.create()` / `createAndPoll()` / `retrieve()` / `update()` / `list()` / `cancel()`
- `beta.threads.runs.submitToolOutputs()` / `submitToolOutputsAndPoll()`

**Run Steps:**
- `beta.threads.runs.steps.list()` / `retrieve()`

## Client Adapters

Client adapters interface with AI provider APIs. All adapters work with both API surfaces.

### OpenAI

```typescript
import { openaiClientAdapter } from 'supercompat/openaiResponses'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const client = createClient({
  client: openaiClientAdapter({ openai }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

### Anthropic (Claude)

```typescript
import { anthropicClientAdapter } from 'supercompat/openaiResponses'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const client = createClient({
  client: anthropicClientAdapter({ anthropic }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

### Groq

```typescript
import { groqClientAdapter } from 'supercompat/openaiResponses'
import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const client = createClient({
  client: groqClientAdapter({ groq }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

### Mistral

```typescript
import { mistralClientAdapter } from 'supercompat/openaiResponses'
import { Mistral } from '@mistralai/mistralai'

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY })

const client = createClient({
  client: mistralClientAdapter({ mistral }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

### Azure OpenAI

```typescript
import { azureOpenaiClientAdapter } from 'supercompat/openaiResponses'
import { AzureOpenAI } from 'openai'

const azureOpenai = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiVersion: '2024-02-15-preview',
})

const client = createClient({
  client: azureOpenaiClientAdapter({ azureOpenai }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

### Azure AI Agents

Use Azure AI Foundry's native Agents API (Assistants API surface only):

```typescript
import { azureAiProjectClientAdapter, azureAgentsStorageAdapter, azureAgentsRunAdapter, supercompat } from 'supercompat/openaiAssistants'
import { AIProjectClient } from '@azure/ai-projects'
import { ClientSecretCredential } from '@azure/identity'
import { PrismaClient } from '@prisma/client'

const credential = new ClientSecretCredential(
  process.env.AZURE_TENANT_ID!,
  process.env.AZURE_CLIENT_ID!,
  process.env.AZURE_CLIENT_SECRET!
)

const azureAiProject = new AIProjectClient(
  process.env.AZURE_PROJECT_ENDPOINT!,
  credential
)

const prisma = new PrismaClient()
const runAdapter = azureAgentsRunAdapter({ azureAiProject })

const client = supercompat({
  client: azureAiProjectClientAdapter({ azureAiProject }),
  storage: azureAgentsStorageAdapter({ azureAiProject, prisma }),
  runAdapter,
})
```

Azure AI Agents storage requires an additional Prisma model for persisting function tool call outputs:

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
  @@index([createdAt(sort: Desc)])
}
```

### Google Gemini

```typescript
import { googleClientAdapter } from 'supercompat/openaiResponses'
import { GoogleGenAI } from '@google/genai'

const google = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })

const client = createClient({
  client: googleClientAdapter({ google }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

### OpenRouter

Access 200+ models through a single API:

```typescript
import { openRouterClientAdapter } from 'supercompat/openaiResponses'
import { OpenRouter } from '@openrouter/sdk'

const openRouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })

const client = createClient({
  client: openRouterClientAdapter({ openRouter }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

### Perplexity

```typescript
import { perplexityClientAdapter } from 'supercompat/openaiResponses'
import OpenAI from 'openai'

const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai',
})

const client = createClient({
  client: perplexityClientAdapter({ perplexity }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

### Together AI

```typescript
import { togetherClientAdapter } from 'supercompat/openaiResponses'
import OpenAI from 'openai'

const together = new OpenAI({
  apiKey: process.env.TOGETHER_API_KEY,
  baseURL: 'https://api.together.xyz/v1',
})

const client = createClient({
  client: togetherClientAdapter({ together }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

### Ollama (Local)

```typescript
import { ollamaClientAdapter } from 'supercompat/openaiResponses'
import OpenAI from 'openai'

const ollama = new OpenAI({
  apiKey: 'ollama',
  baseURL: 'http://localhost:11434/v1',
})

const client = createClient({
  client: ollamaClientAdapter({ ollama }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

## Storage Adapters

### Prisma Storage Adapter

Store everything in your own database. Each API surface has its own `prismaStorageAdapter` with appropriate models.

```typescript
// Responses API — uses Conversation, Response, ResponseOutputItem, etc.
import { prismaStorageAdapter } from 'supercompat/openaiResponses'

// Assistants API — uses Thread, Message, Run, RunStep, Assistant
import { prismaStorageAdapter } from 'supercompat/openaiAssistants'
```

### OpenAI Responses API Storage Adapter

Use OpenAI's Responses API for storage (no database needed, Assistants API surface only):

```typescript
import { supercompat, openaiClientAdapter, responsesStorageAdapter, responsesRunAdapter } from 'supercompat'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const client = supercompat({
  client: openaiClientAdapter({ openai }),
  storage: responsesStorageAdapter({ openai }),
  runAdapter: responsesRunAdapter(),
})
```

## Run Adapters

### Completions Run Adapter

Uses chat completions under the hood. Works with all client adapters and both API surfaces:

```typescript
import { completionsRunAdapter } from 'supercompat/openaiResponses'
```

### Responses Run Adapter

Uses OpenAI's Responses API. For use with `responsesStorageAdapter`:

```typescript
import { responsesRunAdapter } from 'supercompat'
```

### Azure Agents Run Adapter

For use with Azure AI Agents:

```typescript
import { azureAgentsRunAdapter } from 'supercompat'
```

## Testing

```bash
npm run test
npm run test:env  # with environment variables
```

## License

MIT

---

Made by [Supercorp](https://github.com/supercorp-ai)
