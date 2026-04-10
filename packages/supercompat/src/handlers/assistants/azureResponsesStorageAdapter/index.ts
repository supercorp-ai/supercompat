import type { OpenAI } from 'openai'
import { StorageAdapterArgs, RunAdapterWithAssistant } from '@/types'
import type { RequestHandler } from '@/types'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'
import { runsRegexp } from '@/lib/runs/runsRegexp'
import { runRegexp } from '@/lib/runs/runRegexp'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import { stepsRegexp } from '@/lib/steps/stepsRegexp'
import { threadRegexp } from '@/lib/threads/threadRegexp'
import { cancelRunRegexp } from '@/lib/runs/cancelRunRegexp'
import { fileRegexp } from '@/lib/files/fileRegexp'
import { responseRegexp } from '@/lib/responses/responseRegexp'
// Reuse handlers from responsesStorageAdapter - they're already generic!
import { threads } from '../responsesStorageAdapter/threads'
import { thread } from '../responsesStorageAdapter/threads/thread'
import { cancelRun as cancel } from '../responsesStorageAdapter/threads/run/cancel'
import { messages } from '../responsesStorageAdapter/threads/messages'
import { runs } from './threads/runs'
import { run } from '../responsesStorageAdapter/threads/run'
import { steps } from '../responsesStorageAdapter/threads/runs/steps'
import { submitToolOutputs } from './threads/runs/submitToolOutputs'
import { assistants } from '../responsesStorageAdapter/assistants'
import { responses } from './responses'

type MethodHandlers = { get?: RequestHandler; post?: RequestHandler; delete?: RequestHandler }


type AzureResponsesStorageAdapterArgs = StorageAdapterArgs & {
  runAdapter: RunAdapterWithAssistant
  originalClient?: any
}

/**
 * Storage adapter for Azure's Responses API (conversations + responses endpoints).
 *
 * Use this with Azure AI Projects and azureAiProjectClientAdapter:
 *
 * @example
 * ```typescript
 * const azureAiProject = new AIProjectClient(endpoint, credential)
 *
 * const client = supercompat({
 *   client: azureAiProjectClientAdapter({ azureAiProject }),
 *   storage: azureResponsesStorageAdapter(),
 *   runAdapter: azureResponsesRunAdapter({ getOpenaiAssistant: () => assistant }),
 * })
 * ```
 */
export const azureResponsesStorageAdapter = (): ((
  args: AzureResponsesStorageAdapterArgs,
) => { requestHandlers: Record<string, MethodHandlers> }) => {
  const createResponseItems: OpenAI.Responses.ResponseInputItem[] = []
  let cachedClient: OpenAI | null = null

  return ({ runAdapter, client, originalClient }: AzureResponsesStorageAdapterArgs) => {
    // Helper to get the AIProjectClient from the original client adapter
    const getAIProjectClient = (): any => {
      // If originalClient is provided and has a 'client' property, unwrap it
      if (originalClient && typeof originalClient === 'object' && 'client' in originalClient) {
        return (originalClient as any).client
      }
      // Fallback to client if originalClient not provided
      return client
    }

    // Helper to get Azure OpenAI client (with OAuth) from AIProjectClient
    const getAzureClient = async (): Promise<OpenAI> => {
      if (cachedClient) {
        return cachedClient
      }

      const aiProjectClient = getAIProjectClient()

      const apiVersion =
        typeof aiProjectClient === 'object'
          ? ((aiProjectClient as any)._options?.apiVersion as string | undefined)
          : undefined

      // Check if it's an AIProjectClient (has getAzureOpenAIClient method)
      if (aiProjectClient && typeof aiProjectClient === 'object' && 'getAzureOpenAIClient' in aiProjectClient && typeof (aiProjectClient as any).getAzureOpenAIClient === 'function') {
        const azureClient = await (aiProjectClient as any).getAzureOpenAIClient(
          apiVersion ? { apiVersion } : undefined,
        )
        cachedClient = azureClient
        return azureClient
      }

      // Older AIProjectClient versions
      if (aiProjectClient && typeof aiProjectClient === 'object' && 'getOpenAIClient' in aiProjectClient && typeof (aiProjectClient as any).getOpenAIClient === 'function') {
        const azureClient = await (aiProjectClient as any).getOpenAIClient(
          apiVersion ? { apiVersion } : undefined,
        )
        cachedClient = azureClient
        return azureClient
      }

      // It's already an OpenAI client
      cachedClient = aiProjectClient
      return aiProjectClient
    }

    // Wrap runAdapter.handleRun to use Azure client instead of placeholder
    const wrappedRunAdapter: RunAdapterWithAssistant = {
      ...runAdapter,
      getOpenaiAssistant: runAdapter.getOpenaiAssistant,
      handleRun: async (args: any) => {
        const azureClient = await getAzureClient()
        return runAdapter.handleRun({ ...args, client: azureClient })
      },
    }

    // Helper to wrap a handler method with async OpenAI client retrieval
    const wrapHandlerMethod = (
      handlerFactory: (args: any) => any,
      method: 'get' | 'post',
    ) => {
      return async (urlString: string, options: RequestInit) => {
        const openaiClient = await getAzureClient()
        const handler = handlerFactory({ client: openaiClient, runAdapter: wrappedRunAdapter, createResponseItems })
        return handler[method](urlString, options)
      }
    }

    // Create wrapped handlers for specified methods
    // Use the REAL Azure client so all API calls have proper authentication
    const createWrappedHandlers = (
      handlerFactory: (args: any) => any,
      methods: Array<'get' | 'post' | 'delete'>,
      additionalArgs: any = {},
    ): MethodHandlers => {
      const wrapped: MethodHandlers = {}
      for (const method of methods) {
        wrapped[method] = async (urlString: string, options: RequestInit) => {
          // Use real Azure client so API calls are properly authenticated
          const azureClient = await getAzureClient()
          const handler = handlerFactory({
            client: azureClient,  // Real Azure client with proper auth
            runAdapter: wrappedRunAdapter,
            createResponseItems,
            ...additionalArgs,
          })
          return handler[method](urlString, options)
        }
      }
      return wrapped
    }

    // For file/vectorStore operations, use the Azure OpenAI client's SDK methods directly.
    // The getAzureClient() returns an authenticated OpenAI client that handles
    // files.create, vectorStores.create, etc. with proper Azure OAuth.
    const fileHandlers = {
      upload: async (_url: string, options: any) => {
        const azureClient = await getAzureClient()
        const formData = await new Response(options.body, { headers: options.headers }).formData()
        const fileBlob = formData.get('file') as File
        const purpose = formData.get('purpose') as string
        const file = await azureClient.files.create({ file: fileBlob, purpose: purpose as 'assistants' })
        return new Response(JSON.stringify(file), { status: 200, headers: { 'Content-Type': 'application/json' } })
      },
      get: async (url: string) => {
        const azureClient = await getAzureClient()
        const fileId = new URL(url).pathname.match(/files\/([^/]+)/)?.[1]!
        const file = await azureClient.files.retrieve(fileId)
        return new Response(JSON.stringify(file), { status: 200, headers: { 'Content-Type': 'application/json' } })
      },
      delete: async (url: string) => {
        const azureClient = await getAzureClient()
        const fileId = new URL(url).pathname.match(/files\/([^/]+)/)?.[1]!
        const result = await azureClient.files.delete(fileId)
        return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } })
      },
      vsCreate: async (_url: string, options: any) => {
        const azureClient = await getAzureClient()
        const body = JSON.parse(options.body)
        const vs = await azureClient.vectorStores.create(body)
        return new Response(JSON.stringify(vs), { status: 200, headers: { 'Content-Type': 'application/json' } })
      },
      vsGet: async (url: string) => {
        const azureClient = await getAzureClient()
        const vsId = new URL(url).pathname.match(/vector_stores\/([^/]+)/)?.[1]!
        const vs = await azureClient.vectorStores.retrieve(vsId)
        return new Response(JSON.stringify(vs), { status: 200, headers: { 'Content-Type': 'application/json' } })
      },
      vsDelete: async (url: string) => {
        const azureClient = await getAzureClient()
        const vsId = new URL(url).pathname.match(/vector_stores\/([^/]+)/)?.[1]!
        const result = await azureClient.vectorStores.delete(vsId)
        return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } })
      },
    }

    return {
      requestHandlers: {
        '^/(?:v1|/?openai)/assistants$': assistants({ runAdapter: wrappedRunAdapter }),
        '^/(?:v1|/?openai)/threads$': createWrappedHandlers(threads, ['post'], { addAnnotations: true }),
        [threadRegexp]: createWrappedHandlers(thread, ['get', 'post', 'delete']),
        [messagesRegexp]: createWrappedHandlers(messages, ['get', 'post']),
        [runsRegexp]: createWrappedHandlers(runs, ['get', 'post']),
        [runRegexp]: createWrappedHandlers(run, ['get']),
        [stepsRegexp]: createWrappedHandlers(steps, ['get']),
        [submitToolOutputsRegexp]: createWrappedHandlers(submitToolOutputs, ['post']),
        [cancelRunRegexp]: createWrappedHandlers(cancel, ['post']),
        [responseRegexp]: createWrappedHandlers(responses, ['get']),
        // File and vector store operations use the Azure OpenAI client's SDK methods
        '^/(?:v1|/?openai)/files$': { post: fileHandlers.upload },
        [fileRegexp]: { get: fileHandlers.get, delete: fileHandlers.delete },
        '^/(?:v1|/?openai)/vector_stores$': { post: fileHandlers.vsCreate },
        '^/(?:v1|/?openai)/vector_stores/[^/]+$': { get: fileHandlers.vsGet, delete: fileHandlers.vsDelete },
      },
    }
  }
}
