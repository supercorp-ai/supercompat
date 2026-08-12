/**
 * Backfill missing `container_file_citation` annotations for orphan
 * `sandbox:/mnt/data/...` URLs in message text.
 *
 * Why this exists
 * ---------------
 * Responses output can contain sandbox URLs without matching
 * `container_file_citation` annotations, especially when a follow-up turn
 * re-references a path created by an earlier code-interpreter call. Without
 * the annotation, consumers know the path but not the provider's file id.
 *
 * The sandbox files are still real and downloadable — they live in the
 * conversation's code-interpreter container and are listable via
 * `GET /v1/containers/{container_id}/files`. This helper looks up the
 * conversation's container (from the most recent `code_interpreter_call`
 * item), lists the container's files, matches each orphan sandbox URL by
 * `path`, and synthesizes the missing annotations in place. If the code-call
 * item is outside the current page, an existing container-file citation in
 * that page can still supply the active container id.
 *
 * The synthesized annotations are emitted as `container_file_citation` (the
 * Responses API native shape) so the existing
 * `serializeItemAsMessage.serializeAnnotations` mapping converts them into
 * the Assistants-API `file_path` shape while retaining `container_id` and
 * `file_id` as separate fields — same as natively cited annotations.
 *
 * Cost
 * ----
 * Zero extra API calls when:
 *   - the conversation never used code_interpreter, OR
 *   - every sandbox URL in the listed messages is already covered by an
 *     annotation.
 * Otherwise: one `containers.files.list` call per invocation. Mutates `items`
 * in place.
 *
 * Limitations
 * -----------
 * - If both the code-interpreter call and every existing container-file
 *   citation fall outside the returned page, we can't recover container_id
 *   and skip backfill for that page.
 * - If the container expired (>20 min idle) or `containers.files.list` 4xxs,
 *   we leave annotations untouched. The renderer will still show a raw
 *   sandbox: link — same as before this helper existed.
 */
import type OpenAI from 'openai'

const SANDBOX_URL_REGEX = /sandbox:(\/[^\s)\]"'<>]+)/g

type AnnotationLike = {
  type?: string
  start_index?: number
  end_index?: number
  container_id?: string
  file_path?: {
    container_id?: string
  }
}

/**
 * True if `[start, end)` is fully covered by an existing file-pointing
 * annotation in `annotations`. The indices follow the API's `[start, end)`
 * convention, so `end_index` points immediately after the URL.
 */
const isCoveredByAnnotation = ({
  start,
  end,
  annotations,
}: {
  start: number
  end: number
  annotations: AnnotationLike[]
}): boolean =>
  annotations.some((a) => {
    if (!a) return false
    if (a.type !== 'container_file_citation' && a.type !== 'file_path')
      return false
    if (typeof a.start_index !== 'number' || typeof a.end_index !== 'number')
      return false
    return a.start_index <= start && a.end_index >= end
  })

/**
 * Returns the `container_id` of the most recent code-interpreter call. When
 * that call is outside the current page, falls back to a container id already
 * present on a file annotation in the page.
 *
 * Items can come in either chronological order — caller doesn't need to sort.
 * We pick the call with the largest `created_at` if available, falling back
 * to the last array element on ties / missing timestamps.
 */
export const findActiveContainerId = ({
  items,
}: {
  items: OpenAI.Conversations.ConversationItem[]
}): string | null => {
  let bestId: string | null = null
  let bestTs: number = -Infinity
  let bestIdx = -1
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i] as any
    if (item?.type !== 'code_interpreter_call') continue
    const containerId: string | null = item.container_id ?? null
    if (!containerId) continue
    const ts: number = typeof item.created_at === 'number' ? item.created_at : 0
    if (ts > bestTs || (ts === bestTs && i > bestIdx)) {
      bestTs = ts
      bestIdx = i
      bestId = containerId
    }
  }
  if (bestId) return bestId

  for (const item of items as any[]) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue
    for (const block of item.content) {
      if (!Array.isArray(block?.annotations)) continue
      for (const annotation of block.annotations as AnnotationLike[]) {
        const containerId =
          annotation?.container_id ?? annotation?.file_path?.container_id
        if (containerId) return containerId
      }
    }
  }

  return null
}

type SandboxOccurrence = {
  url: string
  path: string
  start: number
  end: number
}

/**
 * Returns sandbox URL occurrences in `text` that are NOT covered by any
 * existing file-pointing annotation. Used to decide whether we need to fetch
 * the container's file list at all.
 */
export const findOrphanSandboxOccurrences = ({
  text,
  annotations,
}: {
  text: string
  annotations: AnnotationLike[]
}): SandboxOccurrence[] => {
  const out: SandboxOccurrence[] = []
  for (const m of Array.from(text.matchAll(SANDBOX_URL_REGEX))) {
    const url = m[0]
    const path = m[1]
    const start = m.index ?? 0
    const end = start + url.length
    if (isCoveredByAnnotation({ start, end, annotations })) continue
    out.push({ url, path, start, end })
  }
  return out
}

type ContainerFile = {
  id: string
  path?: string
  container_id?: string
}

/**
 * Lists files in a container. Extracted so tests can stub it without
 * patching the whole OpenAI SDK.
 */
const listContainerFiles = async ({
  client,
  containerId,
}: {
  client: OpenAI
  containerId: string
}): Promise<ContainerFile[]> => {
  const files: ContainerFile[] = []
  // Paginate to make sure we see every file. In practice containers rarely
  // hold more than a handful, but this future-proofs against larger ones.
  for await (const f of client.containers.files.list(containerId, {
    limit: 100,
  })) {
    if (f && typeof f === 'object' && typeof f.id === 'string') {
      files.push(f as ContainerFile)
    }
  }
  return files
}

/**
 * Mutates `items` in place: for each assistant message whose output_text
 * contains sandbox URLs without matching annotations, looks up the matching
 * file_id from the conversation's active container and appends a synthetic
 * `container_file_citation` annotation onto the content block.
 *
 * @returns the number of annotations injected (useful for tests / metrics)
 */
export const backfillContainerFileAnnotations = async ({
  client,
  items,
  listFiles = listContainerFiles,
}: {
  client: OpenAI
  items: OpenAI.Conversations.ConversationItem[]
  /** Override for tests. */
  listFiles?: (args: {
    client: OpenAI
    containerId: string
  }) => Promise<ContainerFile[]>
}): Promise<number> => {
  // First pass: collect orphan sandbox occurrences without doing any I/O.
  type Need = {
    block: any
    occurrences: SandboxOccurrence[]
  }
  const needs: Need[] = []
  for (const item of items as any[]) {
    if (item?.type !== 'message') continue
    const content = Array.isArray(item.content) ? item.content : []
    for (const block of content) {
      if (block?.type !== 'output_text' || typeof block.text !== 'string')
        continue
      const annotations: AnnotationLike[] = Array.isArray(block.annotations)
        ? block.annotations
        : []
      const occurrences = findOrphanSandboxOccurrences({
        text: block.text,
        annotations,
      })
      if (occurrences.length > 0) needs.push({ block, occurrences })
    }
  }
  if (needs.length === 0) return 0

  const containerId = findActiveContainerId({ items })
  if (!containerId) return 0

  let files: ContainerFile[]
  try {
    files = await listFiles({ client, containerId })
  } catch {
    // Container expired / unreachable — leave annotations alone.
    return 0
  }

  const pathToFileId = new Map<string, string>()
  for (const f of files) {
    if (f.path && f.id) pathToFileId.set(f.path, f.id)
  }
  if (pathToFileId.size === 0) return 0

  let injected = 0
  for (const need of needs) {
    const existing = Array.isArray(need.block.annotations)
      ? need.block.annotations.slice()
      : []
    for (const occ of need.occurrences) {
      const fileId = pathToFileId.get(occ.path)
      if (!fileId) continue
      existing.push({
        type: 'container_file_citation' as const,
        text: '',
        start_index: occ.start,
        end_index: occ.end,
        file_id: fileId,
        container_id: containerId,
        filename: occ.path.replace(/^.*\//, ''),
      })
      injected += 1
    }
    need.block.annotations = existing
  }
  return injected
}
