import type { OpenAI } from 'openai'
import { StorageAdapterArgs, RunAdapterWithAssistant } from '@/types'
import type { RequestHandler } from '@/types'
import { messagesRegexp } from '@/openaiAssistants/lib/messages/messagesRegexp'
import { runsRegexp } from '@/openaiAssistants/lib/runs/runsRegexp'
import { runRegexp } from '@/openaiAssistants/lib/runs/runRegexp'
import { submitToolOutputsRegexp } from '@/openaiAssistants/lib/runs/submitToolOutputsRegexp'
import { stepsRegexp } from '@/openaiAssistants/lib/steps/stepsRegexp'
import { threadRegexp } from '@/openaiAssistants/lib/threads/threadRegexp'
import { cancelRunRegexp } from '@/openaiAssistants/lib/runs/cancelRunRegexp'
import { fileRegexp } from '@/openaiAssistants/lib/files/fileRegexp'
import { responseRegexp } from '@/openaiAssistants/lib/responses/responseRegexp'
// Reuse handlers from responsesStorageAdapter - they're already generic!
import { threads } from '../responsesStorageAdapter/threads'
import { thread } from '../responsesStorageAdapter/threads/thread'
import { cancelRun as cancel } from '../responsesStorageAdapter/threads/run/cancel'
import { messages } from '../responsesStorageAdapter/threads/messages'
// File and vector store handlers from Azure Agents adapter
import { post as fileUploadPost, del as fileDeleteHandler } from '../azureAgentsStorageAdapter/files/upload'
import { file as fileGet } from '../azureAgentsStorageAdapter/files/get'
import { createVectorStore, getVectorStore, deleteVectorStore } from '../azureAgentsStorageAdapter/vectorStores'
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
 *   runAdapter: responsesRunAdapter({ getOpenaiAssistant: () => assistant }),
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

    // Lazy v1 client for file/vectorStore operations (v2 SDK lacks agents.files)
    let cachedFileClient: any = null
    const getFileClient = async () => {
      if (cachedFileClient) return cachedFileClient
      const aiProject = getAIProjectClient()
      if (aiProject?.agents?.files) {
        cachedFileClient = aiProject
        return aiProject
      }
      const { AIProjectClient: V1 } = await import('@azure/ai-projects')
      cachedFileClient = new V1(aiProject._endpoint, aiProject._credential)
      return cachedFileClient
    }

    const createLazyFileHandler = (op: string): RequestHandler => async (url: string, options: any) => {
      const fc = await getFileClient()
      const handlers: Record<string, any> = {
        upload: fileUploadPost({ azureAiProject: fc }),
        get: fileGet({ azureAiProject: fc }).get,
        delete: fileDeleteHandler({ azureAiProject: fc }),
        vsCreate: createVectorStore({ azureAiProject: fc }),
        vsGet: getVectorStore({ azureAiProject: fc }),
        vsDelete: deleteVectorStore({ azureAiProject: fc }),
      }
      return handlers[op](url, options)
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
        // File and vector store handlers need v1 AIProjectClient (has agents.files/vectorStores).
        // Handlers lazily create a v1 client from the v2 client's endpoint/credentials.
        '^/(?:v1|/?openai)/files$': { post: createLazyFileHandler('upload') },
        [fileRegexp]: { get: createLazyFileHandler('get'), delete: createLazyFileHandler('delete') },
        '^/(?:v1|/?openai)/vector_stores$': { post: createLazyFileHandler('vsCreate') },
        '^/(?:v1|/?openai)/vector_stores/[^/]+$': { get: createLazyFileHandler('vsGet'), delete: createLazyFileHandler('vsDelete') },
      },
    }
  }
}
