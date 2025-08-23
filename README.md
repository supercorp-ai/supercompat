# Supercompat

Supercompat allows you to use any AI provider like Anthropic, Groq or Mistral with OpenAI-compatible Assistants API.

# Install

```
npm i supercompat
```

## Usage

```ts
import {
  supercompat,
  groqClientAdapter,
  prismaStorageAdapter,
    completionsRunAdapter,
    responsesRunAdapter, // use the Responses API
  } from 'supercompat'
import Groq from 'groq-sdk'

const client = supercompat({
  client: groqClientAdapter({
    groq: new Groq(),
  }),
  storage: prismaStorageAdapter({
    prisma,
  }),
  runAdapter: responsesRunAdapter(),
})

const message = await client.beta.threads.messages.create(thread.id, {
  role: 'user',
  content: 'Who won the world series in 2020?'
})
```

## Setup

```prisma
// prisma.schema
model Thread {
  id  String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  assistantId String @db.Uuid
  assistant Assistant @relation(fields: [assistantId], references: [id], onDelete: Cascade)
  metadata Json?
  messages Message[]
  runs Run[]
  runSteps RunStep[]
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @db.Timestamptz(6)

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
  id  String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  threadId String @db.Uuid
  thread Thread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  role MessageRole
  content Json
  status MessageStatus @default(COMPLETED)
  assistantId String? @db.Uuid
  assistant Assistant? @relation(fields: [assistantId], references: [id], onDelete: Cascade)
  runId String? @db.Uuid
  run Run? @relation(fields: [runId], references: [id], onDelete: Cascade)
  completedAt DateTime? @db.Timestamptz(6)
  incompleteAt DateTime? @db.Timestamptz(6)
  incompleteDetails Json?
  attachments Json[] @default([])
  metadata Json?
  toolCalls Json?
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @db.Timestamptz(6)

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
  id  String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  threadId String @db.Uuid
  thread Thread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  assistantId String @db.Uuid
  assistant Assistant @relation(fields: [assistantId], references: [id], onDelete: Cascade)
  status RunStatus
  requiredAction Json?
  lastError Json?
  expiresAt Int
  startedAt Int?
  cancelledAt Int?
  failedAt Int?
  completedAt Int?
  model String
  instructions String
  tools Json[] @default([])
  metadata Json?
  usage Json?
  truncationStrategy Json @default("{ \"type\": \"auto\" }")
  responseFormat Json @default("{ \"type\": \"text\" }")
  runSteps RunStep[]
  messages Message[]
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @db.Timestamptz(6)
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
  id  String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  threadId String @db.Uuid
  thread Thread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  assistantId String @db.Uuid
  assistant Assistant @relation(fields: [assistantId], references: [id], onDelete: Cascade)
  runId String @db.Uuid
  run Run @relation(fields: [runId], references: [id], onDelete: Cascade)
  type RunStepType
  status RunStepStatus
  stepDetails Json
  lastError Json?
  expiredAt Int?
  cancelledAt Int?
  failedAt Int?
  completedAt Int?
  metadata Json?
  usage Json?
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @db.Timestamptz(6)

  @@index([threadId, runId, type, status])
  @@index([createdAt(sort: Asc)])
}

model Assistant {
  id  String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  threads Thread[]
  runs Run[]
  runSteps RunStep[]
  messages Message[]
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @db.Timestamptz(6)
}
```
