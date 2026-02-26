import type { PrismaClient } from '@prisma/client'
import { assistantRegexp } from '@/lib/assistants/assistantRegexp'
import { serializeAssistant } from '../serializeAssistant'

export const post = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string, options: RequestInit & { body?: string }) => {
  const url = new URL(urlString)
  const [, assistantId] = url.pathname.match(new RegExp(assistantRegexp))!

  if (!options.body) {
    throw new Error('Request body is required')
  }

  const body = JSON.parse(options.body)

  const assistant = await prisma.assistant.update({
    where: { id: assistantId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.instructions !== undefined && { instructions: body.instructions }),
      ...(body.model !== undefined && { modelSlug: body.model }),
      ...(body.metadata !== undefined && { metadata: body.metadata }),
    },
  })

  return new Response(JSON.stringify(
    serializeAssistant({ assistant }),
  ), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
