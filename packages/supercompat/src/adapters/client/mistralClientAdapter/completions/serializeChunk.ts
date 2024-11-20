const serializeDelta = ({
  delta: {
    toolCalls,
    ...rest
  },
}: {
  delta: any
}) => ({
  ...rest,
  ...(toolCalls ? {
    tool_calls: toolCalls,
  } : {}),
})

const serializeChoice = ({
  choice: {
    finishReason,
    delta,
    ...rest
  },
}: {
  choice: any
}) => ({
  ...rest,
  finish_reason: finishReason ?? null,
  delta: serializeDelta({ delta }),
})

export const serializeChunk = ({
  chunk,
}: {
  chunk: any
}) => ({
  ...chunk.data,
  ...(chunk.data.choices ? {
    choices: chunk.data.choices.map((choice: any) => (
      serializeChoice({ choice })
    )),
  }: {}),
})
