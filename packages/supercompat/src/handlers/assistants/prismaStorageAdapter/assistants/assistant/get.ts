import type { PrismaClient } from '@prisma/client'
import { assistantRegexp } from '@/lib/assistants/assistantRegexp'
import { serializeAssistant } from '../serializeAssistant'

export const get = ({
  prisma,
}: {
  prisma: PrismaClient
}) => async (urlString: string) => {
  const url = new URL(urlString)
  const [, assistantId] = url.pathname.match(new RegExp(assistantRegexp))!

  const assistant = await prisma.assistant.findUnique({
    where: { id: assistantId },
  })

  if (!assistant) {
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify(
    serializeAssistant({ assistant }),
  ), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
