import type { PrismaClient } from '@prisma/client'
import { StorageAdapterArgs } from '../../openaiAssistants/types'
import type { RequestHandler } from '../../openaiAssistants/types'
import { post as responsesPost } from './responses/post'
import { get as responseGet } from './responses/response/get'
import { del as responseDel } from './responses/response/del'
import { post as cancelPost } from './responses/response/cancel/post'
import { get as inputItemsGet } from './responses/response/inputItems/get'
import {
  createConversation,
  getConversation,
  updateConversation,
  deleteConversation,
  listConversationItems,
  createConversationItems,
  getConversationItem,
  deleteConversationItem,
} from './conversations'

type MethodHandlers = { get?: RequestHandler; post?: RequestHandler; delete?: RequestHandler }

export const prismaStorageAdapter = ({
  prisma,
}: {
  prisma: PrismaClient
}): ((args: StorageAdapterArgs) => { requestHandlers: Record<string, MethodHandlers> }) =>
({ runAdapter }: StorageAdapterArgs) => ({
  requestHandlers: {
    // Conversations — must come before responses patterns
    // Individual item routes must come before items list
    '^/(?:v1/|openai/)?conversations/[^/]+/items/[^/]+$': {
      get: getConversationItem({ prisma }),
      delete: deleteConversationItem({ prisma }),
    },
    '^/(?:v1/|openai/)?conversations/[^/]+/items$': {
      get: listConversationItems({ prisma }),
      post: createConversationItems({ prisma }),
    },
    '^/(?:v1/|openai/)?conversations/[^/]+$': {
      get: getConversation({ prisma }),
      post: updateConversation({ prisma }),
      delete: deleteConversation({ prisma }),
    },
    '^/(?:v1/|openai/)?conversations$': {
      post: createConversation({ prisma }),
    },
    // POST /responses — create response
    '^/(?:v1/|openai/)?responses$': {
      post: responsesPost({ prisma, runAdapter }),
    },
    // POST /responses/{id}/cancel
    '^/(?:v1/|openai/)?responses/[^/]+/cancel$': {
      post: cancelPost({ prisma }),
    },
    // GET /responses/{id}/input_items
    '^/(?:v1/|openai/)?responses/[^/]+/input_items$': {
      get: inputItemsGet({ prisma }),
    },
    // GET/DELETE /responses/{id}
    '^/(?:v1/|openai/)?responses/[^/]+$': {
      get: responseGet({ prisma }),
      delete: responseDel({ prisma }),
    },
  },
})
