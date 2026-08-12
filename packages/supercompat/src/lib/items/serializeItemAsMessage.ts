import { uid } from 'radash'
import type OpenAI from 'openai'

type ItemType =
  | OpenAI.Conversations.ConversationItem
  | OpenAI.Responses.ResponseItem
  | OpenAI.Responses.ResponseInputItem.Message

type ContainerFilePathAnnotation =
  OpenAI.Beta.Threads.Messages.FilePathAnnotation & {
    file_path: OpenAI.Beta.Threads.Messages.FilePathAnnotation['file_path'] & {
      container_id?: string
    }
  }

type ContainerImageFileContentBlock =
  OpenAI.Beta.Threads.Messages.ImageFileContentBlock & {
    image_file: OpenAI.Beta.Threads.Messages.ImageFileContentBlock['image_file'] & {
      container_id: string
    }
  }

const IMAGE_FILENAME_PATTERN = /\.(?:avif|bmp|gif|jpe?g|png|webp)$/i

const isInlineContainerImage = (annotation: any): boolean =>
  annotation?.type === 'container_file_citation' &&
  typeof annotation.container_id === 'string' &&
  typeof annotation.file_id === 'string' &&
  typeof annotation.filename === 'string' &&
  annotation.start_index === annotation.end_index &&
  IMAGE_FILENAME_PATTERN.test(annotation.filename)

const serializeAnnotations = ({
  annotations,
}: {
  annotations: any[]
}): OpenAI.Beta.Threads.Messages.Annotation[] =>
  annotations
    .map((ann: any) => {
      if (ann.type === 'file_citation') {
        return {
          type: 'file_citation' as const,
          text: ann.text ?? '',
          start_index: ann.start_index ?? 0,
          end_index: ann.end_index ?? 0,
          file_citation: {
            file_id: ann.file_citation?.file_id ?? ann.file_id ?? '',
          },
        }
      }

      if (ann.type === 'file_path') {
        const containerId = ann.file_path?.container_id ?? ann.container_id
        return {
          type: 'file_path' as const,
          text: ann.text ?? '',
          start_index: ann.start_index ?? 0,
          end_index: ann.end_index ?? 0,
          file_path: {
            file_id: ann.file_path?.file_id ?? ann.file_id ?? '',
            ...(containerId ? { container_id: containerId } : {}),
          },
        } as ContainerFilePathAnnotation
      }

      // Responses API code interpreter annotations.
      //
      // The Responses API references files via (container_id, file_id) pairs,
      // where file_ids look like `cfile_xxx`. The Assistants API `file_path`
      // annotation only carries `file_id`, so we preserve `container_id` as
      // an additive field. Existing Assistants consumers can ignore it while
      // container-aware consumers can route to the correct endpoint without
      // changing the meaning of `file_id`.
      if (ann.type === 'container_file_citation') {
        const fileId = ann.file_id ?? ''
        const containerId = ann.container_id ?? ''
        return {
          type: 'file_path' as const,
          text: ann.text ?? '',
          start_index: ann.start_index ?? 0,
          end_index: ann.end_index ?? 0,
          file_path: {
            file_id: fileId,
            ...(containerId ? { container_id: containerId } : {}),
          },
        } as ContainerFilePathAnnotation
      }

      return null
    })
    .filter(Boolean) as OpenAI.Beta.Threads.Messages.Annotation[]

const serializeContent = ({
  item,
}: {
  item: ItemType
}): OpenAI.Beta.Threads.Messages.MessageContent[] => {
  if (item.type === 'message') {
    return item.content.flatMap((contentBlock) => {
      if (contentBlock.type === 'input_text') {
        return [
          {
            type: 'text' as const,
            text: {
              value: contentBlock.text,
              annotations: [],
            },
          },
        ]
      } else if (contentBlock.type === 'output_text') {
        const rawAnnotations = (contentBlock as any).annotations ?? []
        const textContent = {
          type: 'text' as const,
          text: {
            value: contentBlock.text,
            annotations: serializeAnnotations({ annotations: rawAnnotations }),
          },
        }
        const seenImageFileIds = new Set<string>()
        const inlineImages = rawAnnotations
          .filter(isInlineContainerImage)
          .filter((annotation: any) => {
            const imageKey = `${annotation.container_id}:${annotation.file_id}`
            if (seenImageFileIds.has(imageKey)) return false
            seenImageFileIds.add(imageKey)
            return true
          })
          .map(
            (annotation: any) =>
              ({
                type: 'image_file' as const,
                image_file: {
                  file_id: annotation.file_id,
                  container_id: annotation.container_id,
                  detail: 'auto' as const,
                },
              }) as ContainerImageFileContentBlock,
          )

        return [textContent, ...inlineImages]
      } else if (contentBlock.type === 'input_image') {
        return [
          {
            type: 'image_file' as const,
            image_file: {
              file_id: contentBlock.file_id,
              detail: 'auto',
            },
          },
        ]
      }

      return []
    }) as OpenAI.Beta.Threads.Messages.MessageContent[]
  } else if (item.type === 'image_generation_call') {
    if (!item.result) return []

    return [
      {
        type: 'image_url' as const,
        image_url: {
          // @ts-expect-error bad openai types
          url: `data:image/${item.output_format};base64,${item.result}`,
          detail: 'auto' as const,
        },
      },
    ]
  } else {
    return []
  }
}

const serializeAttachments = ({
  item,
}: {
  item: ItemType
}): OpenAI.Beta.Threads.Messages.Message['attachments'] => {
  if (item.type !== 'message') return []

  const inputFiles = item.content.filter(
    (contentBlock) =>
      contentBlock.type === 'input_file' && contentBlock.file_id,
  ) as OpenAI.Responses.ResponseInputFile[]

  return inputFiles.map((inputFile: OpenAI.Responses.ResponseInputFile) => ({
    file_id: inputFile.file_id!,
  }))
}

const serializeMetadata = ({
  item,
}: {
  item: ItemType
}): OpenAI.Beta.Threads.Messages.Message['metadata'] => {
  const metadata = (item as any).metadata
  if (
    metadata &&
    typeof metadata === 'object' &&
    Object.keys(metadata).length > 0
  ) {
    return metadata
  }
  return null
}
// assign(message.metadata as Record<any, any> ?? {}, message.toolCalls ? { toolCalls: message.toolCalls } : {}),

export const serializeItemAsMessage = ({
  item,
  threadId,
  openaiAssistant,
  createdAt,
  runId = null,
  status = 'completed',
}: {
  item: ItemType
  threadId: string
  openaiAssistant: Pick<OpenAI.Beta.Assistants.Assistant, 'id'>
  createdAt: number
  runId?: string | null
  status?: 'completed' | 'in_progress'
}): OpenAI.Beta.Threads.Message => ({
  id: (item as any).id || uid(24),
  object: 'thread.message' as const,
  created_at: createdAt,
  thread_id: threadId,
  completed_at: null,
  incomplete_at: null,
  incomplete_details: null,
  role:
    typeof (item as any).role === 'string' ? (item as any).role : 'assistant',
  content: serializeContent({ item }),
  assistant_id: (item as any).role === 'assistant' ? openaiAssistant.id : null,
  run_id: runId,
  attachments: serializeAttachments({ item }),
  status:
    typeof (item as any).status === 'string' ? (item as any).status : status,
  metadata: serializeMetadata({ item }),
})
