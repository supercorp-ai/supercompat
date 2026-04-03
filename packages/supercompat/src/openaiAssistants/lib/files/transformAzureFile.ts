import dayjs from 'dayjs'
import type OpenAI from 'openai'

type AzureFileInfo = {
  id: string
  object?: string
  bytes?: number
  filename?: string
  createdAt?: Date | number | string
  purpose?: string
  status?: string
  statusDetails?: string
  expiresAt?: Date | number | string | null
}

const toUnixSeconds = (value?: Date | number | string | null): number | undefined => {
  if (!value) return undefined

  if (value instanceof Date) {
    return dayjs(value).unix()
  }

  if (typeof value === 'number') {
    // Azure sometimes returns seconds, sometimes milliseconds. Assume seconds when <= 10^11
    if (value > 9999999999) {
      return dayjs(value).unix()
    }
    return Math.floor(value)
  }

  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.unix() : undefined
}

export const transformAzureFile = (file: AzureFileInfo): OpenAI.Files.FileObject => {
  const createdAtUnix = toUnixSeconds(file.createdAt) ?? dayjs().unix()
  const expiresAtUnix = toUnixSeconds(file.expiresAt)

  const openaiFile: OpenAI.Files.FileObject = {
    id: file.id,
    object: (file.object || 'file') as OpenAI.Files.FileObject['object'],
    bytes: file.bytes ?? 0,
    created_at: createdAtUnix,
    filename: file.filename || 'file',
    purpose: (file.purpose || 'assistants') as OpenAI.Files.FileObject['purpose'],
    status: (file.status || 'processed') as OpenAI.Files.FileObject['status'],
  }

  if (expiresAtUnix !== undefined) {
    openaiFile.expires_at = expiresAtUnix
  }

  if (file.statusDetails) {
    openaiFile.status_details = file.statusDetails
  }

  return openaiFile
}
