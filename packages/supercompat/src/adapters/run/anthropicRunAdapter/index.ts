import _ from 'lodash'
import { uid, omit, isEmpty } from 'radash'
import dayjs from 'dayjs'
import type OpenAI from 'openai'
import type Anthropic from '@anthropic-ai/sdk'
import { MessageWithRun } from '@/types'
import { messages } from './messages'
import { serializeTools } from './serializeTools'
import { serializeContent } from './serializeContent'

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

export const anthropicRunAdapter = ({
  messagesHistoryLength = 10,
  maxTokens = 4096,
}: {
  messagesHistoryLength?: number
  maxTokens?: number
}) => async ({
  client,
  run,
  onEvent,
  getMessages,
}: {
  client: OpenAI
  run: OpenAI.Beta.Threads.Run
  onEvent: (event: OpenAI.Beta.AssistantStreamEvent) => Promise<any>
  getMessages: () => Promise<MessageWithRun[]>
}) => {
  if (run.status !== 'queued') return

  onEvent({
    event: 'thread.run.in_progress',
    data: {
      ...run,
      status: 'in_progress',
    },
  })

  const isStream = isEmpty(run.tools)

  const opts = {
    messages: await messages({
      run,
      getMessages,
      messagesHistoryLength,
    }),
    stream: isStream,
    model: run.model,
    max_tokens: maxTokens,
    ...(isEmpty(run.tools) ? {} : { tools: serializeTools({ run }) }),
  }

  console.dir({ opts }, { depth: null })
  let providerResponse

  try {
    // @ts-ignore-next-line
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
      file_ids: [],
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

  if (isStream) {
    for await (const messageStreamEvent of providerResponse) {
      // @ts-ignore-next-line
      if (messageStreamEvent.type === 'content_block_delta') {
        // @ts-ignore-next-line
        currentContent = `${currentContent}${messageStreamEvent.delta.text ?? ''}`

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
                    // @ts-ignore-next-line
                    value: messageStreamEvent.delta.text,
                  },
                },
              ],
            },
          },
        } as OpenAI.Beta.AssistantStreamEvent.ThreadMessageDelta)
      }
    }
  } else {
    // @ts-ignore-next-line
    const textContentBlock = providerResponse.content.filter((c: any) => c.type === 'text')[0]

    if (textContentBlock) {
      currentContent = textContentBlock.text
    }

    // @ts-ignore-next-line
    const toolUseBlocks = providerResponse.content.filter((c: any) => c.type === 'tool_use')

    if (!isEmpty(toolUseBlocks)) {
      currentToolCalls = toolUseBlocks.map((tc: any) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.input),
        },
      }))

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
            tool_calls: currentToolCalls,
          },
        },
      })
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
