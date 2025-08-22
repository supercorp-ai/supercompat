import type OpenAI from "openai";
import type { PrismaClient } from "@prisma/client";
import { RunStatus } from "@/types/prisma";

export const threadRunRequiresAction = async ({
  prisma,
  event,
  controller,
}: {
  prisma: PrismaClient;
  event: OpenAI.Beta.AssistantStreamEvent.ThreadRunRequiresAction;
  controller: ReadableStreamDefaultController<OpenAI.Beta.AssistantStreamEvent.ThreadRunRequiresAction>;
}) => {
  controller.enqueue(event);

  const runRecord = await prisma.run.update({
    where: {
      id: event.data.id,
    },
    data: {
      status: RunStatus.REQUIRES_ACTION,
      requiredAction: event.data.required_action,
    },
  });

  if (event.data.metadata?.openaiConversationId) {
    const thread = await prisma.thread.findUnique({
      where: { id: event.data.thread_id },
    });
    await prisma.thread.update({
      where: { id: event.data.thread_id },
      data: {
        metadata: {
          ...(thread?.metadata as any),
          openaiConversationId: event.data.metadata.openaiConversationId,
        },
      },
    });
  }

  return runRecord;
};
