import OpenAI from 'openai'

export const serializeThreadMessage = ({
  item,
  threadId,
  assistantId,
}: {
  item: any
  threadId: string
  assistantId?: string | null
}): OpenAI.Beta.Threads.Messages.Message => ({
  id: item.id ?? `msg_${Math.random().toString(36).slice(2)}`,
  object: 'thread.message',
  created_at: Math.floor(Date.now() / 1000),
  thread_id: threadId,
  completed_at: Math.floor(Date.now() / 1000),
  incomplete_at: null,
  incomplete_details: null as any,
  role: (item.role ?? 'assistant') as any,
  content: [
    {
      type: 'text',
      text: {
        value: (
          item.content?.find?.((c: any) => c.type === 'input_text')?.text ??
          item.content?.find?.((c: any) => c.type === 'output_text')?.text ??
          item.content?.find?.((c: any) => c.type === 'text')?.text ??
          item.text ??
          ''
        ) as string,
        annotations: [],
      },
    },
  ] as any,
  assistant_id: assistantId ?? null,
  run_id: null,
  attachments: [],
  status: 'completed',
  metadata: {},
})

