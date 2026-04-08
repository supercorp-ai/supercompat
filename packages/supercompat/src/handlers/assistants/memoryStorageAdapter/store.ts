import { randomUUID } from 'node:crypto'

export type StoreRecord = Record<string, any> & {
  id: string
  createdAt: Date
  updatedAt: Date
}

let globalSeq = 0

export class Collection<T extends StoreRecord = StoreRecord> {
  private items = new Map<string, T>()

  create(data: Partial<T>): T {
    const now = new Date()
    const record = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...data,
      _seq: globalSeq++,
    } as unknown as T
    this.items.set(record.id, record)
    return structuredClone(record)
  }

  findUnique(where: Partial<T>): T | null {
    if (where.id) {
      const item = this.items.get(where.id as string)
      if (!item) return null
      // Check additional where conditions
      for (const [key, value] of Object.entries(where)) {
        if (key === 'id') continue
        if ((item as any)[key] !== value) return null
      }
      return structuredClone(item)
    }
    // Scan for match
    const items = Array.from(this.items.values())
    for (const item of items) {
      let match = true
      for (const [key, value] of Object.entries(where)) {
        if ((item as any)[key] !== value) { match = false; break }
      }
      if (match) return structuredClone(item)
    }
    return null
  }

  findUniqueOrThrow(where: Partial<T>): T {
    const item = this.findUnique(where)
    if (!item) throw new Error(`Record not found`)
    return item
  }

  findFirst(opts: { where?: Record<string, any>; orderBy?: Record<string, 'asc' | 'desc'> }): T | null {
    const results = this.findMany({ ...opts, take: 1 })
    return results[0] ?? null
  }

  findMany(opts: {
    where?: Record<string, any>
    orderBy?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>
    take?: number
    skip?: number
    cursor?: { id: string }
  } = {}): T[] {
    let results = Array.from(this.items.values())

    // Filter
    if (opts.where) {
      results = results.filter(item => matchesWhere(item, opts.where!))
    }

    // Sort
    if (opts.orderBy) {
      const orderEntries = Array.isArray(opts.orderBy)
        ? opts.orderBy.flatMap(o => Object.entries(o))
        : Object.entries(opts.orderBy)

      const lastDir = orderEntries[orderEntries.length - 1]?.[1] ?? 'asc'
      results.sort((a, b) => {
        for (const [key, dir] of orderEntries) {
          const av = (a as any)[key]
          const bv = (b as any)[key]
          if (av < bv) return dir === 'asc' ? -1 : 1
          if (av > bv) return dir === 'asc' ? 1 : -1
        }
        // Tiebreaker: use insertion order, following the primary sort direction
        const seqDiff = ((a as any)._seq ?? 0) - ((b as any)._seq ?? 0)
        return lastDir === 'asc' ? seqDiff : -seqDiff
      })
    }

    // Cursor + Take handling (Prisma semantics)
    if (opts.cursor?.id) {
      const idx = results.findIndex(r => r.id === opts.cursor!.id)
      if (idx >= 0) {
        if (opts.take !== undefined && opts.take < 0) {
          // Negative take: take items BEFORE the cursor (cursor excluded via skip:1)
          const beforeCursor = results.slice(0, idx)
          results = beforeCursor.slice(opts.take)
        } else {
          // Positive take: take items FROM the cursor forward
          results = results.slice(idx)
          if (opts.skip) results = results.slice(opts.skip)
          if (opts.take !== undefined) results = results.slice(0, opts.take)
        }
      }
    } else {
      if (opts.skip) results = results.slice(opts.skip)
      if (opts.take !== undefined) {
        if (opts.take < 0) {
          results = results.slice(opts.take)
        } else {
          results = results.slice(0, opts.take)
        }
      }
    }

    return results.map(r => structuredClone(r))
  }

  update(where: Partial<T>, data: Partial<T>): T {
    const existing = this.findExisting(where)
    if (!existing) throw new Error(`Record not found for update`)
    const updated = { ...existing, ...data, updatedAt: new Date() }
    this.items.set(existing.id, updated)
    return structuredClone(updated)
  }

  delete(where: Partial<T>): T {
    const existing = this.findExisting(where)
    if (!existing) throw new Error(`Record not found for delete`)
    this.items.delete(existing.id)
    return structuredClone(existing)
  }

  deleteMany(where: Record<string, any>): number {
    let count = 0
    for (const item of Array.from(this.items.values())) {
      if (matchesWhere(item, where)) {
        this.items.delete(item.id)
        count++
      }
    }
    return count
  }

  count(opts: { where?: Record<string, any> } = {}): number {
    if (!opts.where) return this.items.size
    return Array.from(this.items.values()).filter(item => matchesWhere(item, opts.where!)).length
  }

  private findExisting(where: Partial<T>): T | undefined {
    if (where.id) {
      const item = this.items.get(where.id as string)
      if (!item) return undefined
      for (const [key, value] of Object.entries(where)) {
        if (key === 'id') continue
        if ((item as any)[key] !== value) return undefined
      }
      return item
    }
    for (const item of Array.from(this.items.values())) {
      let match = true
      for (const [key, value] of Object.entries(where)) {
        if ((item as any)[key] !== value) { match = false; break }
      }
      if (match) return item
    }
    return undefined
  }
}

function matchesWhere(item: any, where: Record<string, any>): boolean {
  for (const [key, value] of Object.entries(where)) {
    if (value && typeof value === 'object' && 'in' in value) {
      if (!value.in.includes(item[key])) return false
    } else if (item[key] !== value) {
      return false
    }
  }
  return true
}

export type ResponseRecord = StoreRecord & {
  status: string
  model: string
  instructions?: string | null
  metadata?: unknown
  maxOutputTokens?: number | null
  temperature?: number | null
  topP?: number | null
  truncationType?: string | null
  truncationLastMessagesCount?: number | null
  textFormatType?: string | null
  textFormatSchema?: unknown
  usage?: unknown
  conversationId?: string | null
  error?: unknown
}

export type OutputItemRecord = StoreRecord & {
  type: string
  status: string
  role?: string | null
  content?: unknown
  callId?: string | null
  name?: string | null
  arguments?: string | null
  actions?: unknown
  pendingSafetyChecks?: unknown
  responseId?: string
}

export class MemoryStore {
  assistants = new Collection()
  threads = new Collection()
  messages = new Collection()
  runs = new Collection()
  runSteps = new Collection()
  conversations = new Collection()
  responses = new Collection<ResponseRecord>()
  responseOutputItems = new Collection<OutputItemRecord>()
  responseTools = new Collection()
  responseFunctionTools = new Collection()
  responseFileSearchTools = new Collection()
  responseWebSearchTools = new Collection()
  responseCodeInterpreterTools = new Collection()
  responseComputerUseTools = new Collection()
}
