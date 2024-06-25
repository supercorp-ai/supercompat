import _ from 'lodash'
import { uid, omit, isEmpty } from 'radash'
import dayjs from 'dayjs'
import OpenAI from 'openai'
import { MessageWithRun } from '@/types'
import { messages } from './messages'
import { supercompat } from '@/supercompat'

const updatedToolCall = ({
  toolCall,
  delta,
}: {
  toolCall: any
  delta: any
}) => {
  if (!toolCall) return omit(delta, ['index'])

  // if (delta.type !== 'function') return toolCall

  const result = _.cloneDeep(toolCall)

  for (const [key, value] of Object.entries(delta.function)) {
    result.function[key] = `${result.function[key] ?? ''}${value}`
  }

  return result
}

const toolCallsData = ({
  prevToolCalls,
  delta,
}: {
  prevToolCalls: any
  delta: any
}) => {
  if (!prevToolCalls) {
    return delta.tool_calls.map((tc: any) => ({
      id: uid(24),
      type: 'function',
      ...omit(tc, ['index']),
    }))
  }

  const newToolCalls = _.cloneDeep(prevToolCalls)

  for (const runStepDelta of delta.tool_calls) {
    newToolCalls[runStepDelta.index] = updatedToolCall({
      toolCall: newToolCalls[runStepDelta.index],
      delta: runStepDelta,
    })
  }

  return newToolCalls
}

export const completionsRunAdapter = ({
  messagesHistoryLength = 10,
  maxTokens = undefined,
}: {
  messagesHistoryLength?: number
  maxTokens?: number
}) => async ({
  client: clientAdapter,
  run,
  onEvent,
  getMessages,
  responseFormat,
}: {
  client: OpenAI
  run: OpenAI.Beta.Threads.Run
  onEvent: (event: OpenAI.Beta.AssistantStreamEvent) => Promise<any>
  getMessages: () => Promise<MessageWithRun[]>
  responseFormat?: OpenAI.Beta.Threads.Run['response_format']
}) => {
  if (run.status !== 'queued') return

  const client = new OpenAI({
    apiKey: 'SUPERCOMPAT_PLACEHOLDER_OPENAI_KEY',
    fetch: supercompat({
      client: clientAdapter,
      // @ts-ignore-next-line
      storage: () => {},
      // @ts-ignore-next-line
      runAdapter: {},
    }),
  })

  onEvent({
    event: 'thread.run.in_progress',
    data: {
      ...run,
      status: 'in_progress',
    },
  })

  const opts = {
    messages: await messages({
      run,
      getMessages,
      messagesHistoryLength,
    }),
    model: run.model,
    stream: true,
    ...(responseFormat ? { response_format: responseFormat } : {}),
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    ...(isEmpty(run.tools) ? {} : { tools: run.tools }),
  } as OpenAI.ChatCompletionCreateParamsStreaming

  console.dir({ opts }, { depth: null })
  let providerResponse

  try {
    providerResponse = await client.chat.completions.create(opts)
  } catch(e) {
    console.error(e)
    return onEvent({
      event: 'thread.run.failed',
      data: {
        ...run,
        failed_at: dayjs().unix(),
        status: 'in_progress',
        last_error: (e as { message: OpenAI.Beta.Threads.Runs.Run.LastError }).message,
      },
    })
  }

  let message = await onEvent({
    event: 'thread.message.created',
    data: {
      id: 'THERE_IS_A_BUG_IN_SUPERCOMPAT_IF_YOU_SEE_THIS_ID',
      object: 'thread.message',
      completed_at: null,
      run_id: run.id,
      created_at: dayjs().unix(),
      assistant_id: run.assistant_id,
      incomplete_at: null,
      incomplete_details: null,
      metadata: {},
      attachments: [],
      thread_id: run.thread_id,
      content: [{ text: { value: '', annotations: [] }, type: 'text' }],
      role: 'assistant',
      status: 'in_progress',
    },
  })

  onEvent({
    event: 'thread.run.step.created',
    data: {
      id: 'THERE_IS_A_BUG_IN_SUPERCOMPAT_IF_YOU_SEE_THIS_ID',
      object: 'thread.run.step',
      run_id: run.id,
      assistant_id: run.assistant_id,
      thread_id: run.thread_id,
      type: 'message_creation',
      status: 'completed',
      completed_at: dayjs().unix(),
      created_at: dayjs().unix(),
      expired_at: null,
      last_error: null,
      metadata: {},
      failed_at: null,
      cancelled_at: null,
      usage: null,
      step_details: {
        type: 'message_creation',
        message_creation: {
          message_id: message.id,
        },
      },
    },
  })

  let toolCallsRunStep
  let currentContent = ''
  let currentToolCalls

  console.dir({ providerResponse }, { depth: null })
  for await (const chunk of providerResponse) {
    const delta = chunk.choices[0].delta

    if (delta.content) {
      currentContent = `${currentContent}${delta.content ?? ''}`
    }

    if (delta.tool_calls) {
      if (!toolCallsRunStep) {
        toolCallsRunStep = await onEvent({
          event: 'thread.run.step.created',
          data: {
            id: 'THERE_IS_A_BUG_IN_SUPERCOMPAT_IF_YOU_SEE_THIS_ID',
            object: 'thread.run.step',
            run_id: run.id,
            assistant_id: run.assistant_id,
            thread_id: run.thread_id,
            type: 'tool_calls',
            status: 'in_progress',
            completed_at: null,
            created_at: dayjs().unix(),
            expired_at: null,
            last_error: null,
            metadata: {},
            failed_at: null,
            cancelled_at: null,
            usage: null,
            step_details: {
              type: 'tool_calls',
              tool_calls: [],
            },
          },
        })
      }

      onEvent({
        event: 'thread.run.step.delta',
        data: {
          object: 'thread.run.step.delta',
          run_id: run.id,
          id: toolCallsRunStep.id,
          delta: {
            step_details: {
              type: 'tool_calls',
              tool_calls: delta.tool_calls.map((tc: any) => ({
                id: uid(24),
                type: 'function',
                ...tc,
              })),
            },
          },
        },
      } as OpenAI.Beta.AssistantStreamEvent.ThreadRunStepDelta)

      currentToolCalls = toolCallsData({ prevToolCalls: currentToolCalls, delta })
    }

    if (delta.content) {
      onEvent({
        event: 'thread.message.delta',
        data: {
          id: message.id,
          delta: {
            content: [
              {
                type: 'text',
                index: 0,
                text: {
                  value: delta.content,
                },
              },
            ],
          },
        },
      } as OpenAI.Beta.AssistantStreamEvent.ThreadMessageDelta)
    }
  }

  message = await onEvent({
    event: 'thread.message.completed',
    data: {
      ...message,
      status: 'completed',
      content: [{ text: { value: currentContent, annotations: [] }, type: 'text' }],
      tool_calls: currentToolCalls,
    },
  })

  if (isEmpty(message.toolCalls)) {
    return onEvent({
      event: 'thread.run.completed',
      data: {
        ...run,
        status: 'completed',
        completed_at: dayjs().unix(),
      },
    })
  }

  return onEvent({
    event: 'thread.run.requires_action',
    data: {
      ...run,
      status: 'requires_action',
      required_action: {
        type: 'submit_tool_outputs',
        submit_tool_outputs: {
          tool_calls: message.toolCalls,
        },
      },
    },
  })
}
