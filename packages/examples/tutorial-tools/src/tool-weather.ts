/**
 * Model-facing Consumer of the `ctx.weather` capability seam: exposes the
 * capability as the `weather` tool and declares its UI render intent.
 * @module @deepseek-ai/dsh-tutorial-tools/tool-weather
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-weather'
export const inject = ['tools', 'weather']

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'weather',
    description: 'Get the current weather for a location.',
    parameters: {
      location: { type: 'string', required: true, description: 'City or place name' },
    },
    output: {
      // Structured canonical value so a chaining consumer can read fields directly.
      schema: {
        type: 'object',
        properties: {
          location: { type: 'string', required: true },
          temperatureC: { type: 'number', required: true },
          condition: { type: 'string', required: true },
        },
        additionalProperties: false,
      },
      render: (_args, value) => [{
        type: 'text',
        text: `${value.temperatureC}°C, ${value.condition} in ${value.location}`,
      }],
      // Replayable card facts: a UI rebuilds the completed card from the
      // session log without persisting the canonical value.
      presentationMeta: (_args, value) => ({
        location: value.location,
        temperatureC: value.temperatureC,
        condition: value.condition,
      }),
    },
    presentCall: (args) => {
      const { location } = args
      return {
        card: 'generic',
        title: location === '' ? 'Weather' : `Weather in ${location}`,
        kind: 'fetch',
        rawInput: location,
      }
    },
    presentResult: (args, result) => {
      if (result.isError) return undefined
      const { location } = args
      return {
        card: 'generic',
        title: location === '' ? 'Weather' : `Forecast for ${location}`,
        content: result.content,
      }
    },
    async execute(args, exec) {
      // The schema requires a string; it cannot express non-empty, so hand-check it.
      const location = args.location.trim()
      if (location === '') throw new Error('weather: location must not be empty')
      return ctx.weather.get({ location, signal: exec.signal })
    },
  }))
}
