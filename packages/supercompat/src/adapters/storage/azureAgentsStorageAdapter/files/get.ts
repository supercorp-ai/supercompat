import type { AIProjectClient } from '@azure/ai-projects'
import { fileRegexp } from '@/lib/files/fileRegexp'
import type { RequestHandler } from '@/types'
import { transformAzureFile } from '@/lib/files/transformAzureFile'

export const file = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}): { get: RequestHandler } => ({
  get: async (url) => {
    const { pathname } = new URL(url)
    const match = pathname.match(new RegExp(fileRegexp))

    if (!match) {
      return new Response('Not Found', { status: 404 })
    }

    const [, fileId] = match
    const azureFile = await azureAiProject.agents.files.get(fileId)
    const openaiFile = transformAzureFile(azureFile)

    return new Response(JSON.stringify(openaiFile), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  },
})
