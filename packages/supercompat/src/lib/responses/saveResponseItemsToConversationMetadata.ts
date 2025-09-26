import type OpenAI from 'openai'

/* ======================= responseItemsMap helpers ======================= */

type ItemResponseEntry = { responseId: string; itemIds: string[] }
type ConversationMetadata = Record<string, string>

const BUCKET_PREFIX = 'responseItemsMap' // keys: responseItemsMap0..15
const MAX_BUCKETS = 16 // OpenAI metadata key limit
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
type Pair = { responseId: string; itemId: string }

function parseAllPairs({ metadata }: { metadata: ConversationMetadata }): Pair[] {
  const indices = listBucketIndices({ metadata })
  const pairs: Pair[] = []
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

function serializeNonBucketEntries({ entries }: { entries: Array<[string, string]> }): ConversationMetadata {
  const result: ConversationMetadata = {}
  for (const [key, value] of entries) {
    result[key] = value
  }
  return result
}

function packIntoBuckets({ pairs, slots }: { pairs: Pair[]; slots: number }): string[] | undefined {
  const buckets: string[] = []
  let currentEntries: ItemResponseEntry[] = []

  const flush = () => {
    if (currentEntries.length === 0) return true
    const serialized = serializeBucket({ entries: currentEntries })
    if (serialized.length > MAX_VALUE_LENGTH) return false
    if (buckets.length >= slots) return false
    buckets.push(serialized)
    currentEntries = []
    return true
  }

  for (const { responseId, itemId } of pairs) {
    const candidateEntries = currentEntries.map((entry) => ({
      responseId: entry.responseId,
      itemIds: [...entry.itemIds],
    }))
    const last = candidateEntries.at(-1)
    if (last && last.responseId === responseId) {
      last.itemIds.push(itemId)
    } else {
      candidateEntries.push({ responseId, itemIds: [itemId] })
    }

    const serialized = serializeBucket({ entries: candidateEntries })
    if (serialized.length <= MAX_VALUE_LENGTH) {
      currentEntries = candidateEntries
      continue
    }

    if (!flush()) return undefined

    currentEntries = [{ responseId, itemIds: [itemId] }]
    if (serializeBucket({ entries: currentEntries }).length > MAX_VALUE_LENGTH) {
      return undefined
    }
  }

  if (!flush()) return undefined

  return buckets
}

function metadataEquals(a: ConversationMetadata, b: ConversationMetadata): boolean {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false
    if (a[key] !== b[key]) return false
  }
  return true
}

export function appendItemIdsToConversationMetadata({
  metadata,
  responseId,
  itemIds,
}: {
  metadata?: ConversationMetadata
  responseId: string
  itemIds: string[]
}): { metadata: ConversationMetadata; changed: boolean } {
  const base = { ...(metadata || {}) }
  const nonBucketEntries = Object.entries(base).filter(([key]) => !key.startsWith(BUCKET_PREFIX))
  const availableSlots = Math.max(0, MAX_BUCKETS - nonBucketEntries.length)
  const preservedNonBucket = serializeNonBucketEntries({ entries: nonBucketEntries })

  if (availableSlots <= 0) {
    return { metadata: base, changed: false }
  }

  const existingPairs = parseAllPairs({ metadata: base })
  const incomingPairs: Pair[] = itemIds.map((id) => ({ responseId, itemId: id }))
  const combinedPairs: Pair[] = existingPairs.concat(incomingPairs)

  let retainedOldestFirst: Pair[] = []

  for (let idx = combinedPairs.length - 1; idx >= 0; idx -= 1) {
    const candidate = [combinedPairs[idx], ...retainedOldestFirst]
    const buckets = packIntoBuckets({ pairs: candidate, slots: availableSlots })
    if (buckets) {
      retainedOldestFirst = candidate
    }
  }

  const buckets = packIntoBuckets({ pairs: retainedOldestFirst, slots: availableSlots })
  if (!buckets) {
    const changed = !metadataEquals(base, preservedNonBucket)
    return { metadata: changed ? preservedNonBucket : base, changed }
  }

  const rebuilt = { ...preservedNonBucket }
  buckets.forEach((value, index) => {
    if (value && value !== '[]') {
      rebuilt[bucketKey({ index })] = value
    }
  })

  const changed = !metadataEquals(base, rebuilt)
  return { metadata: rebuilt, changed }
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
  const { metadata: updated, changed } = appendItemIdsToConversationMetadata({
    metadata: conversation.metadata as Record<string, string> | undefined,
    responseId,
    itemIds,
  })
  if (!changed) return
  await client.conversations.update(threadId, { metadata: updated })
}
