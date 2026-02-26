# Supercompat

**Use any AI provider with the OpenAI Assistants API**

Supercompat is a universal adapter that lets you use OpenAI's Assistants API with any AI provider (Anthropic, Groq, Mistral, Azure, Google, and more). It provides a consistent interface for building AI assistants while allowing you to switch providers seamlessly.

## Features

- 🔄 **Universal AI Provider Support** - Works with OpenAI, Anthropic, Groq, Mistral, Azure, Google, OpenRouter, Perplexity, Together AI, Ollama, and more
- 📦 **Flexible Storage** - Use Prisma with your own database, OpenAI's Responses API, or Azure AI Agents
- 🔌 **Plug-and-Play Architecture** - Mix and match client adapters, storage adapters, and run adapters
- 🌊 **Streaming Support** - Real-time streaming responses for all providers
- 🛠️ **Tool Calling** - Function calling and code interpreter support across providers
- 📊 **Run Steps** - Detailed execution steps for debugging and monitoring
- 🔐 **Type-Safe** - Full TypeScript support with OpenAI's types

## Installation

```bash
npm install supercompat openai
```

Depending on which providers you want to use, install the corresponding SDK:

```bash
# For OpenAI (already installed above)
# Uses the 'openai' package

# For Azure OpenAI (already installed above)
# Uses the 'openai' package

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

### Basic Setup with Groq and Prisma

```typescript
import { supercompat, groqClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat'
import { PrismaClient } from '@prisma/client'
import Groq from 'groq-sdk'

const prisma = new PrismaClient()
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const client = supercompat({
  client: groqClientAdapter({ groq }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})

// Use it like OpenAI's Assistants API
const thread = await client.beta.threads.create()
const message = await client.beta.threads.messages.create(thread.id, {
  role: 'user',
  content: 'What is the capital of France?',
})

const run = await client.beta.threads.runs.createAndPoll(thread.id, {
  assistant_id: 'your-assistant-id',
})
```

## Architecture

Supercompat uses a modular architecture with three types of adapters that plug into the core:

```
┌──────────────────────────┐
│  Client Adapter          │────┐
│  • Anthropic             │    │
│  • Groq                  │    │
│  • OpenAI                │    │
│  • OpenRouter            │    │
│  • Mistral, etc.         │    │
└──────────────────────────┘    │
                                │
┌──────────────────────────┐    │     ┌─────────────────┐      ┌──────────────────────┐
│  Storage Adapter         │────┼────▶│                 │      │  OpenAI Assistants   │
│  • Prisma (Database)     │    │     │   Supercompat   │─────▶│  API Compatible      │
│  • Responses API         │    │     │                 │      │  Interface           │
│  • Azure AI Agents       │────┘     └─────────────────┘      └──────────────────────┘
└──────────────────────────┘    │
                                │
┌──────────────────────────┐    │
│  Run Adapter             │────┘
│  • completions           │
│  • responses             │
│  • azureAgents           │
└──────────────────────────┘
```

**How it works:**

1. **Client Adapters** - Interface with any AI provider (Anthropic, Groq, OpenAI, Mistral, etc.)
2. **Storage Adapters** - Persist data using your preferred backend (Prisma/Database, OpenAI Responses API, Azure AI Agents)
3. **Run Adapters** - Execute runs using different strategies (completions, responses, azureAgents)

You plug all three adapter types into Supercompat, and it exposes an OpenAI Assistants API compatible interface.

*Note: In the future, Supercompat will support translating to other API formats beyond OpenAI Assistants API (e.g., Responses API, etc.)*

## Client Adapters

Client adapters interface with AI provider APIs. Each adapter translates requests to the provider's format.

### Available Client Adapters

#### OpenAI

```typescript
import { openaiClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat'
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'

const prisma = new PrismaClient()
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const client = supercompat({
  client: openaiClientAdapter({ openai }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

#### Anthropic (Claude)

```typescript
import { anthropicClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat'
import { PrismaClient } from '@prisma/client'
import Anthropic from '@anthropic-ai/sdk'

const prisma = new PrismaClient()
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const client = supercompat({
  client: anthropicClientAdapter({ anthropic }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

Supports native Anthropic tool calling including:
- Web search (`web_search_20241111`)
- Code execution (`code_execution_20241022`)
- Computer use (`computer_20241022`)

#### Groq

```typescript
import { groqClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat'
import { PrismaClient } from '@prisma/client'
import Groq from 'groq-sdk'

const prisma = new PrismaClient()
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const client = supercompat({
  client: groqClientAdapter({ groq }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

#### Mistral

```typescript
import { mistralClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat'
import { PrismaClient } from '@prisma/client'
import { Mistral } from '@mistralai/mistralai'

const prisma = new PrismaClient()
const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY })

const client = supercompat({
  client: mistralClientAdapter({ mistral }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

#### Azure OpenAI

```typescript
import { azureOpenaiClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat'
import { PrismaClient } from '@prisma/client'
import { AzureOpenAI } from 'openai'

const prisma = new PrismaClient()
const azureOpenai = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiVersion: '2024-02-15-preview',
})

const client = supercompat({
  client: azureOpenaiClientAdapter({ azureOpenai }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

#### Azure AI Agents

Use Azure AI Foundry's native Agents API:

```typescript
import { azureAiProjectClientAdapter, azureAgentsStorageAdapter, azureAgentsRunAdapter, supercompat } from 'supercompat'
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

**Azure Setup:**

To use Azure AI Agents, you need to:

1. **Create an Azure AI Foundry Project** in the Azure Portal
2. **Create a Service Principal** (App Registration):
   ```bash
   az ad sp create-for-rbac --name "supercompat-app" --role Contributor \
     --scopes /subscriptions/{subscription-id}/resourceGroups/{resource-group}/providers/Microsoft.CognitiveServices/accounts/{ai-project}
   ```
3. **Assign the "Cognitive Services User" role** to the service principal:
   - Go to your AI Project in Azure Portal
   - Navigate to "Access control (IAM)"
   - Click "Add role assignment"
   - Select "Cognitive Services User" role
   - Select your service principal
   - Save

4. **Set environment variables:**
   ```bash
   AZURE_PROJECT_ENDPOINT=https://your-project.cognitiveservices.azure.com/
   AZURE_TENANT_ID=your-tenant-id
   AZURE_CLIENT_ID=your-client-id
   AZURE_CLIENT_SECRET=your-client-secret
   ```

#### Google Gemini

```typescript
import { googleClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat'
import { PrismaClient } from '@prisma/client'
import { GoogleGenAI } from '@google/genai'

const prisma = new PrismaClient()
const google = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })

const client = supercompat({
  client: googleClientAdapter({ google }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

Supports computer use (`computer_use_preview`) via the native Gemini SDK with automatic coordinate denormalization.

#### OpenRouter

Access 200+ models (Gemini, DeepSeek, Qwen, Grok, MiniMax, Kimi, GLM, and more) through a single API:

```typescript
import { openRouterClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat'
import { PrismaClient } from '@prisma/client'
import { OpenRouter } from '@openrouter/sdk'

const prisma = new PrismaClient()
const openRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

const client = supercompat({
  client: openRouterClientAdapter({ openRouter }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

The OpenRouter adapter also works without storage/run adapters for direct chat completions:

```typescript
import { supercompat, openRouterClientAdapter } from 'supercompat'
import { OpenRouter } from '@openrouter/sdk'

const openRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

const client = supercompat({
  client: openRouterClientAdapter({ openRouter }),
})

const result = await client.chat.completions.create({
  model: 'google/gemini-3-flash-preview',
  messages: [{ role: 'user', content: 'Hello!' }],
})
```

#### Perplexity

```typescript
import { perplexityClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat'
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'

const prisma = new PrismaClient()
const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai',
})

const client = supercompat({
  client: perplexityClientAdapter({ perplexity }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

#### Together AI

```typescript
import { togetherClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat'
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'

const prisma = new PrismaClient()
const together = new OpenAI({
  apiKey: process.env.TOGETHER_API_KEY,
  baseURL: 'https://api.together.xyz/v1',
})

const client = supercompat({
  client: togetherClientAdapter({ together }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

#### Ollama (Local)

```typescript
import { ollamaClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat'
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'

const prisma = new PrismaClient()
const ollama = new OpenAI({
  apiKey: 'ollama', // Required but unused
  baseURL: 'http://localhost:11434/v1',
})

const client = supercompat({
  client: ollamaClientAdapter({ ollama }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

#### Humiris

```typescript
import { humirisClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat'
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'

const prisma = new PrismaClient()
const humiris = new OpenAI({
  apiKey: process.env.HUMIRIS_API_KEY,
  baseURL: process.env.HUMIRIS_BASE_URL,
})

const client = supercompat({
  client: humirisClientAdapter({ humiris }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

## Storage Adapters

Storage adapters persist threads, messages, runs, and run steps. Choose based on your infrastructure needs.

### Prisma Storage Adapter

Store everything in your own database using Prisma. Gives you full control over data and queries.

```typescript
import { supercompat, groqClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat'
import { PrismaClient } from '@prisma/client'
import Groq from 'groq-sdk'

const prisma = new PrismaClient()
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const client = supercompat({
  client: groqClientAdapter({ groq }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

#### Database Setup

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

### OpenAI Responses API Storage Adapter

Use OpenAI's Responses API for storage (no database needed):

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

### Azure AI Agents Storage Adapter

Use Azure AI Foundry's native storage with Prisma for function output persistence:

```typescript
import { supercompat, azureAiProjectClientAdapter, azureAgentsStorageAdapter, azureAgentsRunAdapter } from 'supercompat'
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

**Important:** Azure AI Agents storage requires Prisma to persist function tool call outputs. Azure's API does not persist function outputs after submission, so they are stored in a database table and reattached when run steps are retrieved. Add the `AzureAgentsFunctionOutput` model to your Prisma schema:

```prisma
// Azure Agents-specific table for storing function tool call outputs
// since Azure API doesn't persist these after submission
model AzureAgentsFunctionOutput {
  id           String   @id @default(dbgenerated("gen_random_uuid()"))
  runId        String   // The run ID where the tool was called
  toolCallId   String   // The specific tool call ID
  output       String   // The output that was submitted
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([runId, toolCallId])
  @@index([runId])
  @@index([createdAt(sort: Desc)])
}
```

See the [Azure AI Agents setup instructions](#azure-ai-agents) above for details on creating a service principal and configuring permissions.

## Run Adapters

Run adapters execute AI runs and manage streaming. Different adapters support different storage backends.

### Completions Run Adapter

Use with Prisma storage for maximum flexibility:

```typescript
import { completionsRunAdapter } from 'supercompat'

const client = supercompat({
  client: /* any client adapter */,
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

### Responses Run Adapter

Use with OpenAI's Responses API storage:

```typescript
import { responsesRunAdapter } from 'supercompat'

const client = supercompat({
  client: openaiClientAdapter({ openai }),
  storage: responsesStorageAdapter({ openai }),
  runAdapter: responsesRunAdapter(),
})
```

### Azure Agents Run Adapter

Use with Azure AI Agents storage (requires Prisma):

```typescript
import { azureAgentsRunAdapter } from 'supercompat'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const runAdapter = azureAgentsRunAdapter({ azureAiProject })

const client = supercompat({
  client: azureAiProjectClientAdapter({ azureAiProject }),
  storage: azureAgentsStorageAdapter({ azureAiProject, prisma }),
  runAdapter,
})
```

## Usage Examples

### Basic Conversation

```typescript
// Create a thread
const thread = await client.beta.threads.create()

// Add a message
await client.beta.threads.messages.create(thread.id, {
  role: 'user',
  content: 'What is the weather like today?',
})

// Run the assistant
const run = await client.beta.threads.runs.createAndPoll(thread.id, {
  assistant_id: 'asst_abc123',
})

// Get the response
const messages = await client.beta.threads.messages.list(thread.id)
console.log(messages.data[0].content)
```

### Streaming Responses

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
// Create assistant with tools
const assistant = await client.beta.assistants.create({
  model: 'llama-3.3-70b-versatile',
  tools: [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get the current weather for a location',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string' },
          },
          required: ['location'],
        },
      },
    },
  ],
})

// Run with tool calls
const run = await client.beta.threads.runs.createAndPoll(thread.id, {
  assistant_id: assistant.id,
})

// Handle tool calls
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

### Code Interpreter

```typescript
const assistant = await client.beta.assistants.create({
  model: 'gpt-4o',
  tools: [{ type: 'code_interpreter' }],
})

const run = await client.beta.threads.runs.createAndPoll(thread.id, {
  assistant_id: assistant.id,
})

// Get run steps to see code execution
const steps = await client.beta.threads.runs.steps.list(run.id, {
  thread_id: thread.id,
})
for (const step of steps.data) {
  if (step.type === 'tool_calls') {
    console.log(step.step_details.tool_calls)
  }
}
```

### Multiple Providers Example

Use different providers for different use cases:

```typescript
// Fast responses with Groq
const fastClient = supercompat({
  client: groqClientAdapter({ groq }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})

// Complex reasoning with Claude
const smartClient = supercompat({
  client: anthropicClientAdapter({ anthropic }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})

// Cost-effective with Mistral
const economicClient = supercompat({
  client: mistralClientAdapter({ mistral }),
  storage: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})
```

## Configuration Patterns

### Production-Ready Setup

```typescript
import { supercompat, groqClientAdapter, prismaStorageAdapter, completionsRunAdapter } from 'supercompat'
import { PrismaClient } from '@prisma/client'
import Groq from 'groq-sdk'

// Singleton pattern for Prisma
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

// Singleton pattern for AI client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

// Create client factory
function createAssistantClient() {
  return supercompat({
    client: groqClientAdapter({ groq }),
    storage: prismaStorageAdapter({ prisma }),
    runAdapter: completionsRunAdapter(),
  })
}

// Export for use across your app
export const assistantClient = createAssistantClient()
export { prisma }
```

### Multi-Tenant Setup

```typescript
function createTenantClient(tenantId: string) {
  return supercompat({
    client: groqClientAdapter({ groq }),
    storage: prismaStorageAdapter({
      prisma: prisma.$extends({
        query: {
          $allModels: {
            async $allOperations({ args, query }) {
              args.where = { ...args.where, tenantId }
              return query(args)
            },
          },
        },
      }),
    }),
    runAdapter: completionsRunAdapter(),
  })
}
```

## Examples

Check out the `examples/` directory for full working examples:

- **prisma-nextjs** - Full-stack Next.js app with Prisma storage and multiple AI providers

## API Compatibility

Supercompat implements the OpenAI Assistants API, so you can use the [official OpenAI documentation](https://platform.openai.com/docs/assistants/overview) as reference.

### Supported Endpoints

**Assistants:**
- ✅ `beta.assistants.create()` - Create an assistant
- ✅ `beta.assistants.retrieve()` - Get a specific assistant
- ✅ `beta.assistants.update()` - Update an assistant
- ✅ `beta.assistants.list()` - List all assistants
- ✅ `beta.assistants.delete()` - Delete an assistant

**Threads:**
- ✅ `beta.threads.create()` - Create a thread (with optional initial messages)
- ✅ `beta.threads.retrieve()` - Get a specific thread
- ✅ `beta.threads.update()` - Update thread metadata
- ✅ `beta.threads.delete()` - Delete a thread

**Messages:**
- ✅ `beta.threads.messages.create()` - Add a message to a thread
- ✅ `beta.threads.messages.retrieve()` - Get a specific message
- ✅ `beta.threads.messages.update()` - Update message metadata
- ✅ `beta.threads.messages.list()` - List messages with pagination
- ✅ `beta.threads.messages.delete()` - Delete a message

**Runs:**
- ✅ `beta.threads.runs.create()` - Create a run
- ✅ `beta.threads.runs.createAndPoll()` - Create and poll until completion
- ✅ `beta.threads.runs.retrieve()` - Get a specific run
- ✅ `beta.threads.runs.update()` - Update run metadata
- ✅ `beta.threads.runs.list()` - List runs for a thread
- ✅ `beta.threads.runs.cancel()` - Cancel an in-progress run
- ✅ `beta.threads.runs.submitToolOutputs()` - Submit tool call results
- ✅ `beta.threads.runs.submitToolOutputsAndPoll()` - Submit and poll

**Run Steps:**
- ✅ `beta.threads.runs.steps.list()` - List run steps
- ✅ `beta.threads.runs.steps.retrieve()` - Get a specific run step

### Not Yet Supported

**Vector Stores & Files:**
- ❌ `beta.vectorStores.*` - All vector store operations
- ❌ `beta.files.*` - File upload and management operations

*Pull requests welcome to add support for these endpoints!*

## Advanced Features

### Streaming Events

All storage adapters support streaming events:

- `thread.run.created`
- `thread.run.in_progress`
- `thread.run.requires_action`
- `thread.run.completed`
- `thread.run.failed`
- `thread.message.created`
- `thread.message.delta`
- `thread.message.completed`
- `thread.run.step.created`
- `thread.run.step.delta`
- `thread.run.step.completed`

### Error Handling

```typescript
try {
  const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: 'asst_abc123',
  })
} catch (error) {
  if (error.status === 'failed') {
    console.error('Run failed:', error.last_error)
  }
}
```

### Metadata and Custom Fields

```typescript
const thread = await client.beta.threads.create({
  metadata: {
    userId: 'user_123',
    sessionId: 'session_456',
  },
})
```

## Testing

Run the test suite:

```bash
npm run test
```

Run with environment variables:

```bash
npm run test:env
```

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT

## Support

- GitHub Issues: [Report bugs or request features](https://github.com/supercorp-ai/supercompat/issues)
- Documentation: See the `examples/` directory for working code

---

Made with ❤️ by [Supercorp](https://github.com/supercorp-ai)
