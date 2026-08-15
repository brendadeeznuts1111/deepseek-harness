import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WeatherService from '../src/weather.ts'
import * as seam from '../src/index.ts'

class Impl extends WeatherService {
  async get() {
    return { location: 'Berlin', temperatureC: 15, condition: 'sunny' }
  }
}

describe('weather Service Definition', () => {
  it('default-exports the abstract service class and re-exports it by name', () => {
    expect(seam.WeatherService).toBe(WeatherService)
    expect(seam.default).toBe(WeatherService)
  })

  it('registers as ctx.weather when a subclass mounts and dispatches get()', async () => {
    const ctx = new Context()
    await ctx.plugin(Impl)
    expect(ctx.weather).toBeInstanceOf(Impl)
    await expect(ctx.weather.get({ location: 'Berlin' })).resolves.toEqual({
      location: 'Berlin',
      temperatureC: 15,
      condition: 'sunny',
    })
  })
})
