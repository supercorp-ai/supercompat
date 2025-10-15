import 'dotenv/config'
import OpenAI from 'openai'
import { HttpsProxyAgent } from 'https-proxy-agent'

async function main() {
  const apiKey = process.env.TEST_OPENAI_API_KEY
  if (!apiKey) throw new Error('TEST_OPENAI_API_KEY is required')

  const openai = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  })

  const stream = await openai.responses.create({
    model: 'gpt-4.1-mini',
    stream: true,
    instructions:
      'When a user asks about weather in multiple cities, call the provided weather tool once per city before answering.',
    input: [
      {
        role: 'user',
        content:
          'Get the current weather for San Francisco and New York City. Use the weather tool separately for each city.',
      },
    ],
    tools: [
      {
        type: 'function',
        name: 'get_city_weather',
        description: 'Get the weather for a city.',
        parameters: {
          type: 'object',
          properties: {
            city: { type: 'string' },
          },
          required: ['city'],
        },
      },
    ],
  })

  for await (const event of stream) {
    console.log(event.type)
    if (
      event.type === 'response.output_item.added' ||
      event.type === 'response.output_item.done'
    ) {
      console.dir(event.item, { depth: null })
    } else if (event.type === 'response.completed') {
      console.log('Completed status:', event.response.status)
      console.log(
        'Tool calls at completion:',
        event.response.output
          .filter((item: any) => item.type === 'function_call')
          .map((item: any) => ({
            id: item.id,
            call_id: item.call_id,
            status: item.status,
            name: item.name,
            args: item.arguments,
          })),
      )
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
