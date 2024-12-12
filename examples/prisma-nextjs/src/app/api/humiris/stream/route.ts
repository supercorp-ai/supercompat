import OpenAI from 'openai'
import { NextResponse } from 'next/server'
import {
  supercompat,
  openaiClientAdapter,
  prismaStorageAdapter,
  completionsRunAdapter,
} from 'supercompat'
import { prisma } from '@/lib/prisma'

// const tools = [
//   {
//     "type": "function",
//     "function": {
//       "name": "get_current_weather",
//       "description": "Get the current weather in a given location",
//       "parameters": {
//         "type": "object",
//         "properties": {
//           "location": {
//             "type": "string",
//             "description": "The city and state, e.g. San Francisco, CA",
//           },
//           "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]},
//         },
//         "required": ["location"],
//       },
//     }
//   }
// ] as OpenAI.Beta.AssistantTool[]
//
export const GET = async () => {
  const client = supercompat({
    client: openaiClientAdapter({
      openai: new OpenAI({
        baseURL: 'https://basic-chat.humiris.ai/v1/',
        apiKey: '123',
      }),
    }),
    storage: prismaStorageAdapter({
      prisma,
    }),
    runAdapter: completionsRunAdapter(),
  })

  const assistantId = 'b7fd7a65-3504-4ad3-95a0-b83a8eaff0f3'

  const thread = await client.beta.threads.create({
    messages: [],
    metadata: {
      assistantId,
    },
  })

  await client.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'What is the weather in SF?'
  })

  const run = await client.beta.threads.runs.create(
    thread.id,
    {
      assistant_id: assistantId,
      instructions: 'Answer the users question.',
      model: 'Humiris/humiris-moai',
      tools: [],
      stream: true,
      truncation_strategy: {
        type: 'last_messages',
        last_messages: 10,
      },
    },
  )

  for await (const event of run) {
    console.dir({ event }, { depth: null })
  }
  //
  // if (!requiresActionEvent) {
  //   throw new Error('No requires action event')
  // }
  //
  // const toolCallId = requiresActionEvent.data.required_action?.submit_tool_outputs.tool_calls[0].id
  //
  // const submitToolOutputsRun = await client.beta.threads.runs.submitToolOutputs(
  //   thread.id,
  //   requiresActionEvent.data.id,
  //   {
  //     stream: true,
  //     tool_outputs: [
  //       {
  //         tool_call_id: toolCallId,
  //         output: '70 degrees and sunny.',
  //       },
  //     ],
  //   }
  // )
  //
  // for await (const _event of submitToolOutputsRun) {
  // }

  const threadMessages = await client.beta.threads.messages.list(thread.id, { limit: 10 })

  return NextResponse.json({
    threadMessages,
  })
}
