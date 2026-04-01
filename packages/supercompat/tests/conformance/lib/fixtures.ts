import type OpenAI from 'openai'

export const weatherTool: OpenAI.Beta.AssistantTool = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Get the current weather in a city. Returns temperature and conditions.',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' },
      },
      required: ['city'],
    },
  },
}

export const calculatorTool: OpenAI.Beta.AssistantTool = {
  type: 'function',
  function: {
    name: 'calculate',
    description: 'Evaluate a math expression. Returns the numeric result.',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Math expression to evaluate' },
      },
      required: ['expression'],
    },
  },
}

export const weatherToolOutput = JSON.stringify({
  temperature: 72,
  unit: 'F',
  conditions: 'sunny',
})

export const calculatorToolOutput = JSON.stringify({
  result: 42,
})

export const noArgsTool: OpenAI.Beta.AssistantTool = {
  type: 'function',
  function: {
    name: 'get_timestamp',
    description: 'Returns the current server timestamp. Takes no arguments.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
}

export const noArgsToolOutput = JSON.stringify({
  timestamp: '2026-04-01T00:00:00Z',
})

export const complexArgsTool: OpenAI.Beta.AssistantTool = {
  type: 'function',
  function: {
    name: 'create_report',
    description: 'Create a report from structured data.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['heading', 'content'],
          },
        },
        metadata: {
          type: 'object',
          properties: {
            author: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      required: ['title', 'sections'],
    },
  },
}

export const complexArgsToolOutput = JSON.stringify({
  report_id: 'rpt_123',
  status: 'created',
})

export const codeInterpreterTool: OpenAI.Beta.AssistantTool = {
  type: 'code_interpreter' as any,
}

export const fileSearchTool: OpenAI.Beta.AssistantTool = {
  type: 'file_search' as any,
}

// Instructions that reliably make the model call tools
export const instructions = {
  forceWeatherTool:
    'You MUST call the get_weather tool for ANY weather question. NEVER answer a weather question without calling the tool first. This is mandatory — do not skip the tool call.',
  forceCalculatorTool:
    'You MUST call the calculate tool for ANY math question. NEVER compute the answer yourself — always use the tool.',
  forceBothTools:
    'You MUST call get_weather AND calculate tools when asked. Call both tools before responding. Never skip a tool call.',
  noTools:
    'Reply concisely. Do not use any tools.',
  forceNoArgsTool:
    'You MUST call the get_timestamp tool before answering. NEVER answer without calling it first.',
  forceComplexArgsTool:
    'You MUST call the create_report tool with the data the user provides. Include all fields they mention.',
  forceCodeInterpreter:
    'You MUST use the code interpreter to execute the code the user provides. Do NOT answer without running code first.',
  forceParallelTools:
    'You MUST call get_weather AND calculate tools simultaneously in a single response. Call both tools at the same time before replying.',
}

// Prompts designed to trigger specific tool usage
export const prompts = {
  weather: 'What is the weather in San Francisco? Use the get_weather tool.',
  calculator: 'What is 6 * 7? Use the calculate tool.',
  bothTools: 'What is the weather in NYC and what is 6 * 7? Use both tools.',
  simple: 'Reply with exactly: Hello there!',
  noArgs: 'What time is it? Use the get_timestamp tool.',
  complexArgs: 'Create a report titled "Q1 Summary" with two sections: heading "Revenue" content "Up 20%" and heading "Users" content "10k new". Author is "Alice" with tags ["finance", "quarterly"].',
  codeInterpreter: 'Use code interpreter to run: print(sum(range(1, 101)))',
  parallelTools: 'What is the weather in London AND what is 15 * 23? Call both tools at the same time.',
}
