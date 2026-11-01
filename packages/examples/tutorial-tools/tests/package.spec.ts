import { describe, expect, it } from 'vitest'
import * as pkg from '../src/index.ts'
import { WeatherService } from '../src/weather.ts'

describe('tutorial-tools package surface', () => {
  it('default-exports the weather Service Definition with both providers named', () => {
    expect(pkg.default).toBe(WeatherService)
    expect(pkg.WeatherService).toBe(WeatherService)
    expect(pkg.LocalWeatherService).toBeTypeOf('function')
    expect(pkg.WebWeatherService).toBeTypeOf('function')
  })
})
