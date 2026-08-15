/**
 * Service Definition for the `ctx.weather` capability seam: one structured
 * current-weather lookup that local (deterministic mock) and live (HTTP)
 * providers implement and model-facing tools consume.
 * @module @deepseek-ai/dsh-tutorial-tools
 */

import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    weather: WeatherService
  }
}

/** One current-weather lookup request. */
export interface WeatherRequest {
  /** City or place name; providers trim it and reject an empty result. */
  location: string
  /** Caller-owned cancellation forwarded to the provider's network work. */
  signal?: AbortSignal
}

/** The structured current-weather answer. */
export interface WeatherResult {
  /** The trimmed location the forecast is for. */
  location: string
  /** Temperature in degrees Celsius. */
  temperatureC: number
  /** Short human condition text, e.g. \`partly cloudy\`. */
  condition: string
}

/**
 * Abstract current-weather service. Subclass, implement {@link get}, and load
 * the subclass as a plugin — it registers as `ctx.weather` (one
 * implementation per context; a second registration throws, which is cordis'
 * standard duplicate-service behavior).
 *
 * Implementations must honor these semantics:
 * - {@link get} trims the location and rejects an empty one.
 * - {@link get} rejects only for infrastructure or validation failures; a
 *   successful lookup always resolves a complete {@link WeatherResult}.
 */
export abstract class WeatherService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'weather')
  }

  /**
   * Look up the current weather for one location.
   * @param request - the location to look up and optional caller cancellation.
   * @returns the structured current-weather answer.
   */
  abstract get(request: WeatherRequest): Promise<WeatherResult>
}

export default WeatherService
