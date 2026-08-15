import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as pkg from '../src/index.ts'
import * as invariant from '../src/invariant.ts'
import { WeatherService } from '../src/weather.ts'

describe('tutorial-tools package surface', () => {
  it('default-exports the weather Service Definition with both providers named', () => {
    expect(pkg.default).toBe(WeatherService)
    expect(pkg.WeatherService).toBe(WeatherService)
    expect(pkg.LocalWeatherService).toBeTypeOf('function')
    expect(pkg.WebWeatherService).toBeTypeOf('function')
  })

  it('registers the invariant companion', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await ctx.plugin(invariant)
    expect(ctx.invariants).toBeDefined()
  })
})
