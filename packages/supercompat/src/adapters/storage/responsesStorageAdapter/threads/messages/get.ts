import type OpenAI from 'openai'
import type { RunAdapter } from '@/types'
import { assign } from 'radash'
import { messagesRegexp } from '@/lib/messages/messagesRegexp'
import { serializeItemAsMessage } from '@/lib/items/serializeItemAsMessage'
import { responseId } from '@/lib/items/responseId'

type MessageCreateResponse = Response & {
  json: () => Promise<ReturnType<OpenAI.Beta.Threads.Messages['create']>>
}

export const get = ({
  client,
  runAdapter,
}: {
  client: OpenAI
  runAdapter: RunAdapter
}) => async (urlString: string): Promise<MessageCreateResponse> => {
  const url = new URL(urlString)

  const [, threadId] = url.pathname.match(new RegExp(messagesRegexp))!

  const {
    limit,
    order,
    after,
  } = assign({
    limit: '20',
    order: 'desc',
    // after: null,
  }, Object.fromEntries(url.searchParams))

  const conversation = await client.conversations.retrieve(threadId)
  const sortOrder = order === 'asc' ? 'asc' : 'desc'

  const items = await client.conversations.items.list(threadId, {
    limit: parseInt(limit, 10),
    after,
    order: sortOrder,
  })

  const itemsWithRunIds = mapItemsWithRunIds({ conversation, items: items.data })
  const responseMap = await fetchResponsesForItems({
    client,
    items: itemsWithRunIds,
  })

  const timestampedItems = assignTimestamps({
    items: itemsWithRunIds,
    responseMap,
    sortOrder,
    conversationCreatedAt: conversation.created_at,
  })

  const openaiAssistant = await runAdapter.getOpenaiAssistant({ select: { id: true } })

  return new Response(JSON.stringify({
    data: timestampedItems.map(({ item, runId, assignedTimestamp }) => (
      serializeItemAsMessage({
        item,
        threadId,
        openaiAssistant,
        createdAt: assignedTimestamp,
        runId,
      })
    )),
    has_more: items.has_more,
    last_id: items.last_id,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

type ItemWithRunId = {
  item: OpenAI.Conversations.ConversationItem
  runId: string | null
}

type ItemWithAssignedTimestamp = ItemWithRunId & {
  timestamp: number | null
  assignedTimestamp: number
}

const mapItemsWithRunIds = ({
  conversation,
  items,
}: {
  conversation: OpenAI.Conversations.Conversation
  items: OpenAI.Conversations.ConversationItem[]
}): ItemWithRunId[] => (
  items.map((item) => ({
    item,
    runId: item.id ? responseId({
      conversation,
      itemId: item.id,
    }) : null,
  }))
)

const fetchResponsesForItems = async ({
  client,
  items,
}: {
  client: OpenAI
  items: ItemWithRunId[]
}): Promise<Map<string, OpenAI.Responses.Response>> => {
  const responseIds = Array.from(new Set(
    items
      .map(({ runId }) => runId)
      .filter((id): id is string => Boolean(id)),
  ))

  const results = await Promise.allSettled(
    responseIds.map((id) => client.responses.retrieve(id)),
  )

  const map = new Map<string, OpenAI.Responses.Response>()
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      map.set(responseIds[index], result.value)
    }
  })

  return map
}

// Ensure timestamps follow the requested order even when some items lack response metadata.
const assignTimestamps = ({
  items,
  responseMap,
  sortOrder,
  conversationCreatedAt,
}: {
  items: ItemWithRunId[]
  responseMap: Map<string, OpenAI.Responses.Response>
  sortOrder: 'asc' | 'desc'
  conversationCreatedAt: number
}): ItemWithAssignedTimestamp[] => {
  const itemsWithTimestamps = items.map((entry) => ({
    ...entry,
    timestamp: entry.runId ? responseMap.get(entry.runId)?.created_at ?? null : null,
    assignedTimestamp: 0,
  }))

  const fallbackTimestampForIndex = (index: number): number => (
    sortOrder === 'asc'
      ? conversationCreatedAt + index
      : conversationCreatedAt + (itemsWithTimestamps.length - index)
  )

  const findNextKnownTimestamp = (startIndex: number) => {
    for (let i = startIndex; i < itemsWithTimestamps.length; i += 1) {
      const candidate = itemsWithTimestamps[i]
      if (candidate.timestamp != null) {
        return { index: i, timestamp: candidate.timestamp }
      }
    }

    return null
  }

  if (sortOrder === 'asc') {
    let lastAssigned: number | null = null

    itemsWithTimestamps.forEach((entry, index) => {
      let nextValue = entry.timestamp

      if (nextValue == null) {
        if (lastAssigned != null) {
          nextValue = lastAssigned + 1
        } else {
          const nextKnown = findNextKnownTimestamp(index + 1)
          if (nextKnown) {
            const gap = nextKnown.index - index
            nextValue = nextKnown.timestamp - gap
          } else {
            nextValue = fallbackTimestampForIndex(index)
          }
        }
      }

      if (lastAssigned != null && nextValue <= lastAssigned) {
        nextValue = lastAssigned + 1
      }

      entry.assignedTimestamp = nextValue
      lastAssigned = nextValue
    })
  } else {
    let lastAssigned: number | null = null

    itemsWithTimestamps.forEach((entry, index) => {
      let nextValue = entry.timestamp

      if (nextValue == null) {
        if (lastAssigned != null) {
          nextValue = lastAssigned - 1
        } else {
          const nextKnown = findNextKnownTimestamp(index + 1)
          if (nextKnown) {
            const gap = nextKnown.index - index
            nextValue = nextKnown.timestamp + gap
          } else {
            nextValue = fallbackTimestampForIndex(index)
          }
        }
      }

      if (lastAssigned != null && nextValue >= lastAssigned) {
        nextValue = lastAssigned - 1
      }

      entry.assignedTimestamp = nextValue
      lastAssigned = nextValue
    })
  }

  return itemsWithTimestamps
}
