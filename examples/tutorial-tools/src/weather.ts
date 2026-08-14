import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'weather-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'weather',
    description: 'Get the current weather for a location (mock forecast).',
    parameters: {
      location: { type: 'string', required: true, description: 'City or place name' },
    },
    output: {
      // Structured canonical value so a chaining tool can read fields directly.
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
    },
    async execute(args) {
      // Deterministic mock forecast.
      const place = args.location.toLowerCase()
      if (place.includes('london')) return { location: args.location, temperatureC: 14, condition: 'drizzling' }
      if (place.includes('tokyo')) return { location: args.location, temperatureC: 22, condition: 'clear skies' }
      return { location: args.location, temperatureC: 18, condition: 'partly cloudy' }
    },
  }))
}
