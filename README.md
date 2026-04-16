![Supercompat — Switch AI models without compromises.](https://raw.githubusercontent.com/supercorp-ai/supercompat/main/packages/supercompat/supercompat.png)

Supercompat is an AI compatibility layer without compromises. A TypeScript library that lets you call **any LLM provider** through the **OpenAI SDK** (or the **Anthropic SDK**). Swap one adapter and the same `client.responses.create()` call reaches Anthropic, Google, Groq, Mistral, Together, OpenRouter, Perplexity, Ollama, or Azure — with the original SDK types intact.

It runs in-process. No proxy server, no request forwarding, no extra latency. Supercompat installs a custom `fetch` on the SDK instance and routes calls locally.

Full docs: **[supercompat.com/docs](https://supercompat.com/docs)**.

## Install

```bash
npm install supercompat openai
```

## Quick example

```tsx
import {
  supercompat,
  anthropicClientAdapter,
  completionsRunAdapter,
  memoryStorageAdapter,
} from 'supercompat/openai'
import Anthropic from '@anthropic-ai/sdk'

const client = supercompat({
  clientAdapter: anthropicClientAdapter({ anthropic: new Anthropic() }),
  storageAdapter: memoryStorageAdapter(),
  runAdapter: completionsRunAdapter(),
})

const response = await client.responses.create({
  model: 'claude-sonnet-4-6',
  input: 'Say hello.',
})

console.log(response.output_text)
```

`client` is a real `OpenAI` instance with the real TypeScript types. Every call made on it — `responses`, `chat.completions`, `beta.threads` — is intercepted by Supercompat and translated into a request against the Anthropic SDK. Switching providers is a change to `clientAdapter`; everything else stays the same.

## Persistent state

`memoryStorageAdapter` is fine for one-shot scripts but loses everything on restart. For persisted conversations, threads, and runs, swap it for [`prismaStorageAdapter`](https://supercompat.com/docs/adapters/storage-adapters/prisma):

```tsx
import { PrismaClient } from '@prisma/client'
import {
  supercompat,
  anthropicClientAdapter,
  completionsRunAdapter,
  prismaStorageAdapter,
} from 'supercompat/openai'
import Anthropic from '@anthropic-ai/sdk'

const prisma = new PrismaClient()

const client = supercompat({
  clientAdapter: anthropicClientAdapter({ anthropic: new Anthropic() }),
  storageAdapter: prismaStorageAdapter({ prisma }),
  runAdapter: completionsRunAdapter(),
})

// Continue a conversation across requests with previous_response_id:
const first = await client.responses.create({
  model: 'claude-sonnet-4-6',
  input: 'My name is Alice.',
})

const second = await client.responses.create({
  model: 'claude-sonnet-4-6',
  input: 'What did I just tell you?',
  previous_response_id: first.id,
})
```

Conversations, responses, assistants, threads, messages, and runs all land in Postgres. See [Storage adapters](https://supercompat.com/docs/adapters/storage-adapters) for every option — including OpenAI-managed and Azure-managed state.

## Where to go next

- **[Installation](https://supercompat.com/docs/getting-started/installation)** — install the package, pick a provider SDK, and wire them together.
- **[Comparison](https://supercompat.com/docs/getting-started/comparison)** — how Supercompat compares to Vercel AI SDK, LiteLLM, LangChain, and others.
- **[Output SDKs](https://supercompat.com/docs/output-sdks)** — return an OpenAI-shaped or Anthropic-shaped client. Works with every provider.
- **[Adapters](https://supercompat.com/docs/adapters)** — the three adapter types (client, storage, run) and how they compose.
- **[Providers](https://supercompat.com/docs/providers)** — setup notes for OpenAI, Anthropic, Google, Azure, and every other backend.
- **[Tools](https://supercompat.com/docs/tools)** — function calling, web search, file search, code interpreter, and computer use.
- **[Streaming](https://supercompat.com/docs/streaming)** — stream deltas through the OpenAI SDK regardless of which provider is behind it.

## Monorepo layout

This repository is a Turborepo workspace. The published npm package lives at [`packages/supercompat`](./packages/supercompat/) — that's the one most consumers care about. The `docs/` directory holds the MDX source that renders on [supercompat.com/docs](https://supercompat.com/docs).

## Links

- Docs: [supercompat.com/docs](https://supercompat.com/docs)
- npm: [npmjs.com/package/supercompat](https://www.npmjs.com/package/supercompat)
- GitHub: [github.com/supercorp-ai/supercompat](https://github.com/supercorp-ai/supercompat)
- Supported by [Supercorp](https://supercorp.ai)
