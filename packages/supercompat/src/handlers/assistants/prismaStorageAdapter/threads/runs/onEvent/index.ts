import type OpenAI from 'openai'
import type { PrismaClient } from '@prisma/client'
import { handlers } from './handlers'

export const onEvent = ({
  prisma,
  controller,
}: {
  prisma: PrismaClient
  controller: ReadableStreamDefaultController
}) => (event: OpenAI.Beta.AssistantStreamEvent) => {
  // @ts-ignore-next-line
  const handler = handlers[event.event]

  if (!handler) {
    console.log('No handler for event', event)
    return
  }

  return handler({ prisma, controller, event })
}
