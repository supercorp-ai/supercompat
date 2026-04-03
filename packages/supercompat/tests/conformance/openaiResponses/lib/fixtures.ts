/**
 * Shared fixtures for Responses API conformance contracts.
 */
export const weatherTool = {
  type: 'function' as const,
  name: 'get_weather',
  description: 'Get the current weather in a city.',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name' },
    },
    required: ['city'],
  },
}

export const calculatorTool = {
  type: 'function' as const,
  name: 'calculate',
  description: 'Evaluate a math expression.',
  parameters: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'Math expression' },
    },
    required: ['expression'],
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
