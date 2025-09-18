import type OpenAI from 'openai'

/* ======================= responseItemsMap helpers ======================= */

type ItemResponseEntry = { responseId: string; itemIds: string[] }
type ConversationMetadata = Record<string, string>

const BUCKET_PREFIX = 'responseItemsMap' // keys: responseItemsMap0..15
const MAX_BUCKETS = 16 // total metadata key slots we’ll use
const MAX_VALUE_LENGTH = 512 // OpenAI metadata value limit

function parseBucket({ value }: { value?: string }): ItemResponseEntry[] {
  if (!value || value === '[]') return []
  try {
    const arr = JSON.parse(value)
    return Array.isArray(arr) ? (arr as ItemResponseEntry[]) : []
  } catch {
    return []
  }
}

function serializeBucket({ entries }: { entries: ItemResponseEntry[] }): string {
  return JSON.stringify(entries)
}

function bucketKey({ index }: { index: number }): string {
  return `${BUCKET_PREFIX}${index}`
}

function listBucketIndices({ metadata }: { metadata: ConversationMetadata }): number[] {
  return Object.keys(metadata)
    .map((k) => {
      const m = new RegExp(`^${BUCKET_PREFIX}(\\d+)$`).exec(k)
      return m ? Number(m[1]) : -1
    })
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)
}

// Flatten to FIFO (oldest → newest) list of pairs
function parseAllPairs({ metadata }: { metadata: ConversationMetadata }): Array<{ responseId: string; itemId: string }> {
  const indices = listBucketIndices({ metadata })
  const pairs: Array<{ responseId: string; itemId: string }> = []
  for (const idx of indices) {
    const key = bucketKey({ index: idx })
    const entries = parseBucket({ value: metadata[key] })
    for (const e of entries) {
      for (const iid of e.itemIds) {
        pairs.push({ responseId: e.responseId, itemId: iid })
      }
    }
  }
  return pairs
}

// Pack pairs into up to 16 buckets of <=512 chars each
function tryPackPairs({
  baseMetadata,
  pairs,
}: {
  baseMetadata: ConversationMetadata
  pairs: Array<{ responseId: string; itemId: string }>
}): { success: boolean; newMetadata: ConversationMetadata } {
  const newBuckets: string[] = []
  let currentEntries: ItemResponseEntry[] = []

  const flush = () => {
    newBuckets.push(serializeBucket({ entries: currentEntries }))
    currentEntries = []
  }

  for (const { responseId, itemId } of pairs) {
    const next = currentEntries.map((e) => ({ responseId: e.responseId, itemIds: [...e.itemIds] }))
    const last = next[next.length - 1]
    if (last && last.responseId === responseId) {
      last.itemIds.push(itemId)
    } else {
      next.push({ responseId, itemIds: [itemId] })
    }

    const candidate = serializeBucket({ entries: next })
    if (candidate.length <= MAX_VALUE_LENGTH) {
      currentEntries = next
      continue
    }

    flush()
    if (newBuckets.length >= MAX_BUCKETS) {
      return { success: false, newMetadata: baseMetadata }
    }
    currentEntries = [{ responseId, itemIds: [itemId] }]
  }

  if (currentEntries.length > 0) flush()

  const result: ConversationMetadata = {}
  for (const [k, v] of Object.entries(baseMetadata)) {
    if (!k.startsWith(BUCKET_PREFIX)) result[k] = v
  }
  newBuckets.forEach((val, i) => {
    if (val && val !== '[]') result[bucketKey({ index: i })] = val
  })
  return { success: true, newMetadata: result }
}

export function appendItemIdsToConversationMetadata({
  metadata,
  responseId,
  itemIds,
}: {
  metadata?: ConversationMetadata
  responseId: string
  itemIds: string[]
}): ConversationMetadata {
  const base = { ...(metadata || {}) }
  const existing = parseAllPairs({ metadata: base })
  const nextPairs = existing.concat(itemIds.map((id) => ({ responseId, itemId: id })))

  let working = nextPairs
  while (true) {
    const { success, newMetadata } = tryPackPairs({ baseMetadata: base, pairs: working })
    if (success) return newMetadata
    if (working.length === 0) {
      throw new Error('responseItemsMap: cannot pack even a single item into 16 buckets')
    }
    working = working.slice(1)
  }
}

export async function saveResponseItemsToConversationMetadata({
  client,
  threadId,
  responseId,
  itemIds,
}: {
  client: OpenAI
  threadId: string
  responseId: string
  itemIds: string[]
}) {
  const conversation = await client.conversations.retrieve(threadId)
  const updated = appendItemIdsToConversationMetadata({
    metadata: conversation.metadata as Record<string, string> | undefined,
    responseId,
    itemIds,
  })
  await client.conversations.update(threadId, { metadata: updated })
}
