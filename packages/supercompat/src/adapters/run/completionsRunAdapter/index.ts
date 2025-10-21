import _ from 'lodash'
import { uid, omit, isEmpty } from 'radash'
import dayjs from 'dayjs'
import OpenAI from 'openai'
import { MessageWithRun } from '@/types'
import { messages } from './messages'

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
      type: tc.type ?? 'function',
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

export const completionsRunAdapter = () => {
  return {
    handleRun: async ({
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

      const opts = {
        messages: await messages({
          run,
          getMessages,
        }),
        model: run.model,
        stream: true,
        response_format: run.response_format,
        ...(isEmpty(run.tools) ? {} : { tools: run.tools }),
      } as OpenAI.ChatCompletionCreateParamsStreaming

      let providerResponse

      try {
        providerResponse = await client.chat.completions.create(opts)
      } catch(e: any) {
        console.error(e)

        return onEvent({
          event: 'thread.run.failed',
          data: {
            ...run,
            failed_at: dayjs().unix(),
            status: 'in_progress',
            last_error: {
              code: 'server_error',
              message: `${e?.message ?? ''} ${e?.cause?.message ?? ''}`,
            },
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

      for await (const chunk of providerResponse) {
        const choices = chunk.choices ?? []
        const choice = choices[0]
        if (!choice) continue

        const delta = choice.delta

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
                    type: tc.type ?? 'function',
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

      const messageToolCalls = (message.toolCalls ??
        []) as OpenAI.Beta.Threads.Runs.Steps.ToolCall[]

      const functionToolCalls = messageToolCalls.filter(
        (toolCall): toolCall is OpenAI.Beta.Threads.Runs.Steps.FunctionToolCall =>
          toolCall.type === 'function'
      )

      const pendingFunctionToolCalls = functionToolCalls.filter(
        (toolCall) => !toolCall.function?.output
      )

      if (isEmpty(pendingFunctionToolCalls)) {
        if (toolCallsRunStep) {
          toolCallsRunStep = await onEvent({
            event: 'thread.run.step.completed',
            data: {
              ...toolCallsRunStep,
              status: 'completed',
              completed_at: dayjs().unix(),
              step_details: {
                type: 'tool_calls',
                tool_calls: currentToolCalls ?? [],
              },
            },
          })
        }

        return onEvent({
          event: 'thread.run.completed',
          data: {
            ...run,
            status: 'completed',
            completed_at: dayjs().unix(),
          },
        })
      }

      type RequiredToolCall =
        | OpenAI.Beta.Threads.Runs.RequiredActionFunctionToolCall
        | {
            id: string
            type: 'computer_call'
            computer_call: {
              action: any
              pending_safety_checks: any[]
            }
          }

      const requiredToolCalls: RequiredToolCall[] = pendingFunctionToolCalls.map(
        (toolCall) => {
          const args = toolCall.function?.arguments ?? ''

          if (toolCall.function?.name === 'computer_call') {
            let parsedArguments: any = {}
            try {
              parsedArguments = JSON.parse(args || '{}')
            } catch {
              parsedArguments = {}
            }

            const computerCall = {
              action:
                parsedArguments?.action ?? parsedArguments ?? {},
              pending_safety_checks:
                Array.isArray(parsedArguments?.pending_safety_checks)
                  ? parsedArguments.pending_safety_checks
                  : [],
            }

            return {
              id: toolCall.id,
              type: 'computer_call',
              computer_call: computerCall,
            }
          }

          return {
            id: toolCall.id,
            type: 'function',
            function: {
              name: toolCall.function?.name ?? '',
              arguments: args,
            },
          }
        }
      )

      return onEvent({
        event: 'thread.run.requires_action',
        data: {
          ...run,
          status: 'requires_action',
          required_action: {
            type: 'submit_tool_outputs',
            submit_tool_outputs: {
              tool_calls: requiredToolCalls as any,
            },
          },
        },
      })
    }
  }
}
