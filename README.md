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
} from 'supercompat'
import Groq from 'groq-sdk'

const client = supercompat({
  client: groqClientAdapter({
    groq: new Groq(),
  }),
  storage: prismaStorageAdapter({
    prisma,
  }),
  runAdapter: completionsRunAdapter(),
})

const message = await client.beta.threads.messages.create(thread.id, {
  role: 'user',
  content: 'Who won the world series in 2020?'
})
```

## Prisma Setup

- Schema: use `packages/supercompat/prisma/schema.prisma` (kept in sync with the codebase).
- Configure `DATABASE_URL` in your root `.env` (e.g. `postgresql://postgres:postgres@localhost:5432/supercompat_test`).
- Sync DB and generate client:

```
npm install
npm run setup:prisma
```

- Reset DB if needed:

```
npm run setup:prisma:reset
```
