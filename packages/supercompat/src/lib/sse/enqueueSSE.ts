const encoder = new TextEncoder()

/**
 * Enqueue a properly formatted SSE event to a ReadableStream controller.
 * Encodes as Uint8Array so the OpenAI SDK can read the stream correctly.
 */
export const enqueueSSE = (
  controller: ReadableStreamDefaultController,
  event: string,
  data: unknown,
) => {
  try {
    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
  } catch {
    // Controller may already be closed if the stream ended before all events were enqueued
  }
}
