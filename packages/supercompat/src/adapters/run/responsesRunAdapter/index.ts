import _ from "lodash";
import { uid, isEmpty } from "radash";
import dayjs from "dayjs";
import OpenAI from "openai";
import { MessageWithRun } from "@/types";
import { messages } from "./messages";
import { supercompat } from "@/supercompat";

export const responsesRunAdapter =
  () =>
  async ({
    client: clientAdapter,
    run,
    onEvent,
    getMessages,
    getThread,
  }: {
    client: OpenAI;
    run: OpenAI.Beta.Threads.Run;
    onEvent: (event: OpenAI.Beta.AssistantStreamEvent) => Promise<any>;
    getMessages: () => Promise<MessageWithRun[]>;
    getThread: () => Promise<any>;
  }) => {
    if (run.status !== "queued") return;

    const client = supercompat({
      client: clientAdapter,
    });

    onEvent({
      event: "thread.run.in_progress",
      data: {
        ...run,
        status: "in_progress",
      },
    });

    const input = await messages({
      run,
      getMessages,
    });

    const opts: any = {
      model: run.model,
      input,
      ...(run.instructions ? { instructions: run.instructions } : {}),
      ...(isEmpty(run.tools) ? {} : { tools: run.tools }),
      ...(run.response_format && run.response_format.type !== "text"
        ? { response_format: run.response_format }
        : {}),
    };

    let providerResponse: any;
    const thread = await getThread()
    const openaiConversationId = (thread as any)?.openaiConversationId

    try {
      providerResponse = await (client as any).responses.create({
        ...opts,
        ...(openaiConversationId ? { conversation: openaiConversationId } : {}),
        stream: true,
      });
    } catch (e: any) {
      console.error(e);
      return onEvent({
        event: "thread.run.failed",
        data: {
          ...run,
          failed_at: dayjs().unix(),
          status: "in_progress",
          last_error: {
            code: "server_error",
            message: `${e?.message ?? ""} ${e?.cause?.message ?? ""}`,
          },
        },
      });
    }

    let message = await onEvent({
      event: "thread.message.created",
      data: {
        id: "THERE_IS_A_BUG_IN_SUPERCOMPAT_IF_YOU_SEE_THIS_ID",
        object: "thread.message",
        completed_at: null,
        run_id: run.id,
        created_at: dayjs().unix(),
        assistant_id: run.assistant_id,
        incomplete_at: null,
        incomplete_details: null,
        metadata: {},
        attachments: [],
        thread_id: run.thread_id,
        content: [{ text: { value: "", annotations: [] }, type: "text" }],
        role: "assistant",
        status: "in_progress",
      },
    });

    onEvent({
      event: "thread.run.step.created",
      data: {
        id: "THERE_IS_A_BUG_IN_SUPERCOMPAT_IF_YOU_SEE_THIS_ID",
        object: "thread.run.step",
        run_id: run.id,
        assistant_id: run.assistant_id,
        thread_id: run.thread_id,
        type: "message_creation",
        status: "completed",
        completed_at: dayjs().unix(),
        created_at: dayjs().unix(),
        expired_at: null,
        last_error: null,
        metadata: {},
        failed_at: null,
        cancelled_at: null,
        usage: null,
        step_details: {
          type: "message_creation",
          message_creation: {
            message_id: message.id,
          },
        },
      },
    });

    let toolCallsRunStep: any;
    let currentContent = "";
    let currentToolCalls: any[] = [];
    let newConversationId: string | undefined;

    for await (const event of providerResponse) {
      switch (event.type) {
        case "response.created": {
          const convId =
            event.response?.conversation_id ?? event.response?.conversation?.id;
          if (convId) {
            newConversationId = convId;
          }
          break;
        }
        case "response.output_text.delta": {
          currentContent = `${currentContent}${event.delta}`;
          onEvent({
            event: "thread.message.delta",
            data: {
              id: message.id,
              delta: {
                content: [
                  {
                    type: "text",
                    index: 0,
                    text: {
                      value: event.delta,
                    },
                  },
                ],
              },
            },
          } as OpenAI.Beta.AssistantStreamEvent.ThreadMessageDelta);
          break;
        }
        case "response.output_item.added": {
          if (event.item.type === "function_call") {
            if (!toolCallsRunStep) {
              toolCallsRunStep = await onEvent({
                event: "thread.run.step.created",
                data: {
                  id: "THERE_IS_A_BUG_IN_SUPERCOMPAT_IF_YOU_SEE_THIS_ID",
                  object: "thread.run.step",
                  run_id: run.id,
                  assistant_id: run.assistant_id,
                  thread_id: run.thread_id,
                  type: "tool_calls",
                  status: "in_progress",
                  completed_at: null,
                  created_at: dayjs().unix(),
                  expired_at: null,
                  last_error: null,
                  metadata: {},
                  failed_at: null,
                  cancelled_at: null,
                  usage: null,
                  step_details: {
                    type: "tool_calls",
                    tool_calls: [],
                  },
                },
              });
            }

            const newToolCall = {
              id: event.item.id ?? uid(24),
              type: "function",
              function: {
                name: event.item.name,
                arguments: "",
              },
            };
            currentToolCalls.push(_.cloneDeep(newToolCall));

            onEvent({
              event: "thread.run.step.delta",
              data: {
                object: "thread.run.step.delta",
                run_id: run.id,
                id: toolCallsRunStep.id,
                delta: {
                  step_details: {
                    type: "tool_calls",
                    tool_calls: [newToolCall],
                  },
                },
              },
            } as OpenAI.Beta.AssistantStreamEvent.ThreadRunStepDelta);
          }
          break;
        }
        case "response.function_call_arguments.delta": {
          const tc = currentToolCalls.find((t) => t.id === event.item_id);
          if (tc) {
            tc.function.arguments = `${tc.function.arguments}${event.delta}`;
            onEvent({
              event: "thread.run.step.delta",
              data: {
                object: "thread.run.step.delta",
                run_id: run.id,
                id: toolCallsRunStep.id,
                delta: {
                  step_details: {
                    type: "tool_calls",
                    tool_calls: [
                      {
                        id: tc.id,
                        type: "function",
                        function: {
                          name: tc.function.name,
                          arguments: tc.function.arguments,
                        },
                      },
                    ],
                  },
                },
              },
            } as OpenAI.Beta.AssistantStreamEvent.ThreadRunStepDelta);
          }
          break;
        }
        case "response.error": {
          await onEvent({
            event: "thread.run.failed",
            data: {
              ...run,
              ...(newConversationId
                ? {
                    metadata: {
                      ...(run.metadata ?? {}),
                      openaiConversationId: newConversationId,
                    },
                  }
                : {}),
              failed_at: dayjs().unix(),
              status: "in_progress",
              last_error: {
                code: "server_error",
                message: event.error?.message ?? "unknown_error",
              },
            },
          });
          return;
        }
        default:
          break;
      }
    }

    await providerResponse.finalResponse().catch(() => {});

    message = await onEvent({
      event: "thread.message.completed",
      data: {
        ...message,
        status: "completed",
        content: [
          { text: { value: currentContent, annotations: [] }, type: "text" },
        ],
        tool_calls: currentToolCalls,
      },
    });

    if (isEmpty(message.toolCalls)) {
      return onEvent({
        event: "thread.run.completed",
        data: {
          ...run,
          status: "completed",
          completed_at: dayjs().unix(),
          ...(newConversationId
            ? {
                metadata: {
                  ...(run.metadata ?? {}),
                  openaiConversationId: newConversationId,
                },
              }
            : {}),
        },
      });
    }

    return onEvent({
      event: "thread.run.requires_action",
      data: {
        ...run,
        status: "requires_action",
        ...(newConversationId
          ? {
              metadata: {
                ...(run.metadata ?? {}),
                openaiConversationId: newConversationId,
              },
            }
          : {}),
        required_action: {
          type: "submit_tool_outputs",
          submit_tool_outputs: {
            tool_calls: message.toolCalls,
          },
        },
      },
    });
  };
