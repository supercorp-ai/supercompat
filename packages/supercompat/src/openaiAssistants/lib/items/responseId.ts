import type { OpenAI } from 'openai';

type ItemResponseEntry = { responseId: string; itemIds: string[] };

export function responseId({
  conversation,
  itemId,
}: {
  conversation: OpenAI.Conversations.Conversation;
  itemId: string;
}): string | null {
  if (!conversation.metadata) return null

  const metadata = conversation.metadata as Record<string, any>;

  const keys = Object.keys(metadata)
    .map(k => {
      const m = /^responseItemsMap(\d+)$/.exec(k);
      return m ? { key: k, idx: Number(m[1]) } : null;
    })
    .filter((x): x is { key: string; idx: number } => !!x)
    .sort((a, b) => a.idx - b.idx);

  // scan newest → oldest (reverse order), and inside a bucket scan last entry → first
  for (let i = keys.length - 1; i >= 0; i--) {
    const raw = metadata[keys[i].key];
    if (!raw || raw === '[]') continue;

    let arr: ItemResponseEntry[] = [];
    try {
      arr = JSON.parse(raw) as ItemResponseEntry[];
      if (!Array.isArray(arr)) continue;
    } catch {
      continue; // skip bad/partial JSON
    }

    for (let j = arr.length - 1; j >= 0; j--) {
      const entry = arr[j];
      if (entry?.itemIds?.includes(itemId)) {
        return entry.responseId || null;
      }
    }
  }

  return null;
}
