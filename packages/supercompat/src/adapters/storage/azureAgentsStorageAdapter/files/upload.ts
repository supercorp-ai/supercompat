import type { AIProjectClient } from '@azure/ai-projects'
import { Readable } from 'stream'
import dayjs from 'dayjs'
import type { RequestHandler } from '@/types'

export const post = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}): RequestHandler => async (_urlString: string, options: any) => {
  // The body is FormData with 'file' and 'purpose' fields
  // The OpenAI SDK sends this as multipart/form-data
  // We need to extract the file and purpose, then upload to Azure

  // Parse the multipart body - options.body is a FormData-like object or ReadableStream
  const body = options.body

  let fileContent: any
  let fileName = 'upload.txt'
  let purpose = 'assistants'

  if (body && typeof body === 'object' && typeof body.get === 'function') {
    // FormData
    const file = body.get('file')
    purpose = body.get('purpose') || 'assistants'
    if (file && typeof file === 'object') {
      fileName = (file as any).name || 'upload.txt'
      fileContent = file
    }
  }

  if (!fileContent) {
    throw new Error('No file provided')
  }

  // Convert to buffer for Azure SDK
  const arrayBuffer = await (fileContent as Blob).arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const stream = Readable.from(buffer)

  const azureFile = await azureAiProject.agents.files.upload(stream, purpose, {
    fileName,
  })

  return new Response(JSON.stringify({
    id: azureFile.id,
    object: 'file',
    bytes: buffer.length,
    created_at: dayjs().unix(),
    filename: azureFile.filename || fileName,
    purpose: purpose,
    status: 'processed',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const del = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}): RequestHandler => async (urlString: string) => {
  const url = new URL(urlString)
  const fileId = url.pathname.split('/').pop()!

  await azureAiProject.agents.files.delete(fileId)

  return new Response(JSON.stringify({
    id: fileId,
    object: 'file',
    deleted: true,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
