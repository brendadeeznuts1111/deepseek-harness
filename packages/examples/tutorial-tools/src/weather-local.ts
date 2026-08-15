/**
 * Local Service Provider for the `ctx.weather` capability seam: a
 * deterministic, configurable forecast over an exact match on the lowercased
 * place name. The tutorial default: no network, stable answers, deployment
 * tunables expressed in the plugin `Config`.
 * @module @deepseek-ai/dsh-tutorial-tools/weather-local
 */

import { type Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { WeatherService, type WeatherRequest, type WeatherResult } from './weather.ts'

/** One per-place forecast override. */
export interface PlaceOverride {
  /** Temperature in degrees Celsius. */
  temperatureC: number
  /** Short human condition text. */
  condition: string
}

/** Plugin config (schema supplies the defaults; all fields optional at the input). */
export interface Config {
  /** Per-place forecasts keyed by the lowercased place name; an exact match wins. */
  overrides?: Record<string, PlaceOverride>
  /** Temperature in °C reported for a place with no override. */
  defaultTemperatureC?: number
  /** Condition text reported for a place with no override. */
  defaultCondition?: string
}

/** The shape after schemastery applied the defaults. */
type ResolvedConfig = Required<Config>

/**
 * Reject a resolved config this provider could not serve with. The schema
 * expresses neither "finite" nor "non-empty", so a stored value is refused
 * where it is written instead of failing at the first lookup.
 * @param config - the resolved config, schema-valid by construction.
 * @throws Error naming the unusable field.
 */
export function assertServiceableWeatherConfig(config: Required<Config>): void {
  if (!Number.isFinite(config.defaultTemperatureC)) {
    throw new Error('weather-local: defaultTemperatureC must be a finite number')
  }
  for (const [place, override] of Object.entries(config.overrides)) {
    if (!Number.isFinite(override.temperatureC)) {
      throw new Error(`weather-local: override "${place}" temperatureC must be a finite number`)
    }
    if (override.condition.trim() === '') {
      throw new Error(`weather-local: override "${place}" condition must not be empty`)
    }
  }
}

/**
 * Deterministic local weather provider. Each lookup trims the location and
 * matches the lowercased result exactly against `overrides`, falling back to
 * the config defaults for anything else.
 */
export class LocalWeatherService extends WeatherService {
  static Config: z<Config> = z.object({
    overrides: z.dict(z.object({
      temperatureC: z.number(),
      condition: z.string(),
    })).default({}),
    defaultTemperatureC: z.number().default(18),
    defaultCondition: z.string().default('partly cloudy'),
  })

  private readonly config: ResolvedConfig

  constructor(ctx: Context, config: Config) {
    super(ctx)
    // Schemastery fills defaults before construction; the type does not encode that step.
    const resolved = config as ResolvedConfig
    assertServiceableWeatherConfig(resolved)
    this.config = resolved
  }

  get(request: WeatherRequest): Promise<WeatherResult> {
    const location = request.location.trim()
    if (location === '') {
      return Promise.reject(new Error('weather-local: location must not be empty'))
    }
    const override = this.config.overrides[location.toLowerCase()]
    return Promise.resolve({
      location,
      temperatureC: override?.temperatureC ?? this.config.defaultTemperatureC,
      condition: override?.condition ?? this.config.defaultCondition,
    })
  }
}

export default LocalWeatherService
