import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LocalWeatherService, { assertServiceableWeatherConfig } from '../src/weather-local.ts'

async function mount(config?: Record<string, unknown>) {
  const ctx = new Context()
  await ctx.plugin(LocalWeatherService, config)
  return ctx
}

describe('weather-local provider', () => {
  it('serves the schema defaults when config omits fields', async () => {
    const ctx = await mount()
    await expect(ctx.weather.get({ location: 'Berlin' })).resolves.toEqual({
      location: 'Berlin',
      temperatureC: 18,
      condition: 'partly cloudy',
    })
  })

  it('trims the location and matches overrides on the lowercased name', async () => {
    const ctx = await mount({ overrides: { london: { temperatureC: 14, condition: 'drizzling' } } })
    await expect(ctx.weather.get({ location: '  London  ' })).resolves.toEqual({
      location: 'London',
      temperatureC: 14,
      condition: 'drizzling',
    })
    await expect(ctx.weather.get({ location: 'Tokyo' })).resolves.toEqual({
      location: 'Tokyo',
      temperatureC: 18,
      condition: 'partly cloudy',
    })
  })

  it('rejects an empty location', async () => {
    const ctx = await mount()
    await expect(ctx.weather.get({ location: '   ' })).rejects.toThrow('weather-local: location must not be empty')
  })

  it('rejects a config the schema cannot express', () => {
    expect(() => {
      assertServiceableWeatherConfig({
        overrides: {},
        defaultTemperatureC: NaN,
        defaultCondition: 'clear',
      })
    }).toThrow('defaultTemperatureC must be a finite number')
    expect(() => {
      assertServiceableWeatherConfig({
        overrides: { x: { temperatureC: NaN, condition: 'c' } },
        defaultTemperatureC: 18,
        defaultCondition: 'clear',
      })
    }).toThrow('temperatureC must be a finite number')
    expect(() => {
      assertServiceableWeatherConfig({
        overrides: { x: { temperatureC: 1, condition: '   ' } },
        defaultTemperatureC: 18,
        defaultCondition: 'clear',
      })
    }).toThrow('condition must not be empty')
    expect(() => {
      assertServiceableWeatherConfig({
        overrides: { x: { temperatureC: 1, condition: 'windy' } },
        defaultTemperatureC: 18,
        defaultCondition: 'clear',
      })
    }).not.toThrow()
  })
})
