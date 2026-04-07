import { Readable } from 'node:stream'
import type { AIProjectClient } from '@azure/ai-projects'
import { fileContentRegexp } from '@/lib/files/fileContentRegexp'
import type { RequestHandler } from '@/types'

const headersToRecord = (headers: any): Record<string, string> => {
  if (!headers) return {}

  if (typeof headers.get === 'function') {
    const result: Record<string, string> = {}
    for (const headerName of ['content-type', 'content-length']) {
      const value = headers.get(headerName)
      if (value) {
        result[headerName] = value
      }
    }
    return result
  }

  const json = typeof headers.toJSON === 'function' ? headers.toJSON() : headers
  return typeof json === 'object' && json !== null ? json : {}
}

const toBody = async (nodeStream: NodeJS.ReadableStream) => {
  if (typeof (Readable as any).toWeb === 'function') {
    return Readable.toWeb(nodeStream as any) as unknown as BodyInit
  }

  const chunks: Buffer[] = []
  for await (const chunk of nodeStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export const fileContent = ({
  azureAiProject,
}: {
  azureAiProject: AIProjectClient
}): { get: RequestHandler } => ({
  get: async (url) => {
    const { pathname } = new URL(url)
    const match = pathname.match(new RegExp(fileContentRegexp))

    if (!match) {
      return new Response('Not Found', { status: 404 })
    }

    const [, fileId] = match
    const streamable = azureAiProject.agents.files.getContent(fileId)

    if (!streamable || typeof (streamable as any).asNodeStream !== 'function') {
      return new Response('File content unavailable', { status: 500 })
    }

    const nodeResponse = await (streamable as any).asNodeStream()
    const nodeStream = nodeResponse.body

    if (!nodeStream) {
      return new Response('', { status: 204 })
    }

    const headerRecord = headersToRecord(nodeResponse.headers)
    const headers = new Headers()

    for (const [key, value] of Object.entries(headerRecord)) {
      headers.set(key, value)
    }

    if (!headers.has('content-type')) {
      headers.set('Content-Type', 'application/octet-stream')
    }

    const body = await toBody(nodeStream)

    return new Response(body, {
      status: nodeResponse.status ?? 200,
      headers,
    })
  },
})
