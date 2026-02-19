import type OpenAI from 'openai'
import { getQuirks } from './normalizeComputerCall'

// Matches OpenAI's computer_call output format: { action: { type, x, y, ... }, pending_safety_checks: [] }
const buildComputerCallFunction = (model: string, displayWidth: number, displayHeight: number): OpenAI.FunctionDefinition => {
  const quirks = getQuirks(model)

  const coordDesc = quirks.normalizedCoords
    ? 'Coordinates use 0-1000 normalized scale (0,0=top-left, 1000,1000=bottom-right).'
    : quirks.relativeCoords
      ? `Coordinates are relative (0.0-1.0) where 0.0,0.0 is top-left and 1.0,1.0 is bottom-right. Screen is ${displayWidth}x${displayHeight}.`
      : `Coordinates are in pixels (screen is ${displayWidth}x${displayHeight}).`

  const xDesc = quirks.normalizedCoords
    ? 'X coordinate (0-1000 normalized)'
    : quirks.relativeCoords
      ? 'X coordinate (0.0-1.0 relative, where 0.0=left edge, 1.0=right edge)'
      : `X coordinate in pixels (0-${displayWidth})`

  const yDesc = quirks.normalizedCoords
    ? 'Y coordinate (0-1000 normalized)'
    : quirks.relativeCoords
      ? 'Y coordinate (0.0-1.0 relative, where 0.0=top edge, 1.0=bottom edge)'
      : `Y coordinate in pixels (0-${displayHeight})`

  return {
    name: 'computer_call',
    description: `Perform a computer action. ${coordDesc}`,
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'object',
          description: 'The action to perform',
          properties: {
            type: {
              type: 'string',
              enum: [
                'screenshot',
                'click',
                'double_click',
                'type',
                'keypress',
                'scroll',
                'move',
                'drag',
                'wait',
              ],
            },
            x: { type: 'number', description: xDesc },
            y: { type: 'number', description: yDesc },
            text: { type: 'string', description: 'Text to type' },
            keys: {
              type: 'array',
              items: { type: 'string' },
              description: 'Keys to press',
            },
            button: {
              type: 'string',
              enum: ['left', 'right', 'wheel'],
            },
            direction: {
              type: 'string',
              enum: ['up', 'down', 'left', 'right'],
            },
            scroll_x: { type: 'number' },
            scroll_y: { type: 'number' },
            path: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                },
              },
              description: 'Path for drag action',
            },
          },
          required: ['type'],
        },
        pending_safety_checks: {
          type: 'array',
          items: { type: 'object' },
        },
      },
      required: ['action'],
    },
  }
}

export type ComputerUseConfig = {
  displayWidth: number
  displayHeight: number
}

export const transformTools = (
  tools: any[] | undefined,
  model: string,
): { tools: any[]; computerUseConfig: ComputerUseConfig | null } => {
  if (!tools || tools.length === 0) {
    return { tools: tools ?? [], computerUseConfig: null }
  }

  let computerUseConfig: ComputerUseConfig | null = null

  const transformed = tools.map((tool) => {
    if (tool.type === 'computer_use_preview') {
      const config = tool.computer_use_preview ?? tool
      computerUseConfig = {
        displayWidth: config.display_width ?? config.display_width_px ?? 1280,
        displayHeight: config.display_height ?? config.display_height_px ?? 720,
      }
      return {
        type: 'function' as const,
        function: buildComputerCallFunction(model, computerUseConfig.displayWidth, computerUseConfig.displayHeight),
      }
    }
    return tool
  })

  return { tools: transformed, computerUseConfig }
}
