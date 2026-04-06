import type { AIProjectClient } from '@azure/ai-projects'
import type { PrismaClient } from '@prisma/client'
import { StorageAdapterArgs, RunAdapterWithAssistant } from '@/types'
import type { RequestHandler } from '@/types'
import { messagesRegexp } from '@/openaiAssistants/lib/messages/messagesRegexp'
import { messageRegexp } from '@/openaiAssistants/lib/messages/messageRegexp'
import { runsRegexp } from '@/openaiAssistants/lib/runs/runsRegexp'
import { runRegexp } from '@/openaiAssistants/lib/runs/runRegexp'
import { submitToolOutputsRegexp } from '@/openaiAssistants/lib/runs/submitToolOutputsRegexp'
import { cancelRunRegexp } from '@/openaiAssistants/lib/runs/cancelRunRegexp'
import { createThreadAndRunRegexp } from '@/openaiAssistants/lib/runs/createThreadAndRunRegexp'
import { stepsRegexp } from '@/openaiAssistants/lib/steps/stepsRegexp'
import { stepRegexp } from '@/openaiAssistants/lib/steps/stepRegexp'
import { threadRegexp } from '@/openaiAssistants/lib/threads/threadRegexp'
import { threads } from './threads'
import { thread } from './threads/thread'
import { messages } from './threads/messages'
import { message } from './threads/messages/message'
import { runs } from './threads/runs'
import { run } from './threads/run'
import { steps } from './threads/runs/steps'
import { step } from './threads/runs/step'
import { submitToolOutputs } from './threads/runs/submitToolOutputs'
import { post as cancelRunPost } from './threads/runs/cancel'
import { post as createAndRunPost } from './threads/createAndRun/post'
import { assistants } from './assistants'
import { fileRegexp } from '@/openaiAssistants/lib/files/fileRegexp'
import { fileContentRegexp } from '@/openaiAssistants/lib/files/fileContentRegexp'
import { file } from './files/get'
import { fileContent } from './files/content'
import { post as fileUploadPost, del as fileDeleteHandler } from './files/upload'
import { createVectorStore, getVectorStore, deleteVectorStore } from './vectorStores'

type MethodHandlers = { get?: RequestHandler; post?: RequestHandler; delete?: RequestHandler }

type AzureAgentsStorageAdapterArgs = StorageAdapterArgs & {
  runAdapter: RunAdapterWithAssistant
}

export const azureAgentsStorageAdapter = ({
  azureAiProject,
  prisma,
}: {
  azureAiProject: AIProjectClient
  prisma: PrismaClient
}) => {
  return ({ runAdapter }: AzureAgentsStorageAdapterArgs) => ({
    requestHandlers: {
      '^/(?:v1|/?openai)/assistants$': assistants({ runAdapter }),
      '^/(?:v1|/?openai)/threads$': threads({ azureAiProject }),
      [createThreadAndRunRegexp]: { post: createAndRunPost({ azureAiProject, runAdapter }) },
      [threadRegexp]: thread({ azureAiProject }),
      [messagesRegexp]: messages({ azureAiProject, runAdapter }),
      [messageRegexp]: message({ azureAiProject }),
      [runsRegexp]: runs({ azureAiProject, runAdapter }),
      [runRegexp]: run({ azureAiProject, runAdapter }),
      [stepRegexp]: step({ azureAiProject, prisma }),
      [stepsRegexp]: steps({ azureAiProject, runAdapter, prisma }),
      [submitToolOutputsRegexp]: submitToolOutputs({ azureAiProject, runAdapter, prisma }),
      [cancelRunRegexp]: { post: cancelRunPost({ azureAiProject }) },
      [fileRegexp]: { ...file({ azureAiProject }), delete: fileDeleteHandler({ azureAiProject }) },
      [fileContentRegexp]: fileContent({ azureAiProject }),
      '^/(?:v1|/?openai)/files$': { post: fileUploadPost({ azureAiProject }) },
      '^/(?:v1|/?openai)/vector_stores$': { post: createVectorStore({ azureAiProject }) },
      '^/(?:v1|/?openai)/vector_stores/[^/]+$': { get: getVectorStore({ azureAiProject }), delete: deleteVectorStore({ azureAiProject }) },
    },
  })
}
