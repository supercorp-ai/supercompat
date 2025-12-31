import type { OpenAI } from 'openai'
import { StorageAdapterArgs, RunAdapterWithAssistant } from '@/types'
import type { RequestHandler } from '@/types'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'
import { runsRegexp } from '@/lib/runs/runsRegexp'
import { runRegexp } from '@/lib/runs/runRegexp'
import { submitToolOutputsRegexp } from '@/lib/runs/submitToolOutputsRegexp'
import { stepsRegexp } from '@/lib/steps/stepsRegexp'
import { responseRegexp } from '@/lib/responses/responseRegexp'
// Reuse handlers from responsesStorageAdapter - they're already generic!
import { threads } from '../responsesStorageAdapter/threads'
import { messages } from '../responsesStorageAdapter/threads/messages'
import { runs } from './threads/runs'
import { run } from '../responsesStorageAdapter/threads/run'
import { steps } from '../responsesStorageAdapter/threads/runs/steps'
import { submitToolOutputs } from './threads/runs/submitToolOutputs'
import { assistants } from '../responsesStorageAdapter/assistants'
import { responses } from './responses'

type MethodHandlers = { get?: RequestHandler; post?: RequestHandler }


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
      methods: Array<'get' | 'post'>,
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

    return {
      requestHandlers: {
        '^/(?:v1|/?openai)/assistants$': assistants({ runAdapter: wrappedRunAdapter }),
        '^/(?:v1|/?openai)/threads$': createWrappedHandlers(threads, ['post'], { addAnnotations: true }),
        [messagesRegexp]: createWrappedHandlers(messages, ['get', 'post']),
        [runsRegexp]: createWrappedHandlers(runs, ['get', 'post']),  // Added GET for runs.list()
        [runRegexp]: createWrappedHandlers(run, ['get']),
        [stepsRegexp]: createWrappedHandlers(steps, ['get']),
        [submitToolOutputsRegexp]: createWrappedHandlers(submitToolOutputs, ['post']),
        [responseRegexp]: createWrappedHandlers(responses, ['get']),
      },
    }
  }
}
