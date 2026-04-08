import type { AIProjectClient } from '@azure/ai-projects'
import dayjs from 'dayjs'
import type { RequestHandler } from '@/types'

const serializeVectorStore = (vs: any) => ({
  id: vs.id,
  object: 'vector_store',
  created_at: dayjs(vs.createdAt).unix(),
  name: vs.name || null,
  usage_bytes: 0,
  file_counts: vs.fileCounts ? {
    in_progress: vs.fileCounts.inProgress ?? 0,
    completed: vs.fileCounts.completed ?? 0,
    failed: vs.fileCounts.failed ?? 0,
    cancelled: vs.fileCounts.cancelled ?? 0,
    total: vs.fileCounts.total ?? 0,
  } : { in_progress: 0, completed: 0, failed: 0, cancelled: 0, total: 0 },
  status: vs.status || 'completed',
  metadata: vs.metadata || {},
})

// POST /v1/vector_stores — create
export const createVectorStore = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}): RequestHandler => async (_urlString: string, options: any) => {
  const body = JSON.parse(options.body || '{}')

  const vs = await azureAiProject.agents.vectorStores.createAndPoll({
    name: body.name,
    fileIds: body.file_ids || [],
    metadata: body.metadata,
  })

  return new Response(JSON.stringify(serializeVectorStore(vs)), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// GET /v1/vector_stores/{id} — retrieve
export const getVectorStore = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}): RequestHandler => async (urlString: string) => {
  const url = new URL(urlString)
  const vsId = url.pathname.split('/').pop()!

  const vs = await azureAiProject.agents.vectorStores.get(vsId)

  return new Response(JSON.stringify(serializeVectorStore(vs)), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// DELETE /v1/vector_stores/{id} — delete
export const deleteVectorStore = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}): RequestHandler => async (urlString: string) => {
  const url = new URL(urlString)
  const vsId = url.pathname.split('/').pop()!

  await azureAiProject.agents.vectorStores.delete(vsId)

  return new Response(JSON.stringify({
    id: vsId,
    object: 'vector_store.deleted',
    deleted: true,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
