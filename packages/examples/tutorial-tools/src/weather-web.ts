/**
 * Live Service Provider for the `ctx.weather` capability seam: one HTTP GET
 * against a configurable endpoint. The endpoint contract is
 * `GET ${apiUrl}/${encodeURIComponent(location)}` answering
 * `{ "temperatureC": number, "condition": string }`; deployments point
 * `apiUrl` at any service that speaks it.
 * @module @deepseek-ai/dsh-tutorial-tools/weather-web
 */

import { type Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { WeatherService, type WeatherRequest, type WeatherResult } from './weather.ts'

/** Plugin config (schema supplies the defaults; all fields optional at the input). */
export interface Config {
  /** Endpoint answering `GET ${apiUrl}/${encodeURIComponent(location)}` with the forecast JSON. */
  apiUrl?: string
  /** Per-request network timeout in milliseconds. */
  timeoutMs?: number
}

/** The shape after schemastery applied the defaults. */
type ResolvedConfig = Required<Config>

/** The endpoint contract: numeric temperature and string condition. */
interface ForecastPayload {
  temperatureC: number
  condition: string
}

/**
 * Validate one endpoint response into the forecast payload.
 * @param data - the parsed JSON body.
 * @returns the validated payload.
 * @throws Error naming the malformed field.
 */
function parseForecast(data: unknown): ForecastPayload {
  if (typeof data !== 'object' || data === null) {
    throw new Error('weather-web: endpoint answered non-JSON-object')
  }
  const { temperatureC, condition } = data as Record<string, unknown>
  if (typeof temperatureC !== 'number' || typeof condition !== 'string') {
    throw new Error('weather-web: response must carry numeric temperatureC and string condition')
  }
  return { temperatureC, condition }
}

/**
 * Live HTTP weather provider over the global `fetch`. The caller's signal
 * and the configured timeout both abort the request; cleanup clears the timer
 * and the forwarding listener.
 */
export class WebWeatherService extends WeatherService {
  static Config: z<Config> = z.object({
    apiUrl: z.string(),
    timeoutMs: z.number().default(10_000),
  })

  private readonly config: ResolvedConfig

  constructor(ctx: Context, config: Config) {
    super(ctx)
    // Schemastery fills defaults before construction; the type does not encode that step.
    const resolved = config as ResolvedConfig
    if (!Number.isFinite(resolved.timeoutMs) || resolved.timeoutMs <= 0) {
      throw new Error('weather-web: timeoutMs must be a positive finite number')
    }
    if (resolved.apiUrl.trim() === '') throw new Error('weather-web: apiUrl must not be empty')
    this.config = resolved
  }

  async get(request: WeatherRequest): Promise<WeatherResult> {
    const location = request.location.trim()
    if (location === '') throw new Error('weather-web: location must not be empty')
    if (request.signal?.aborted === true) throw new Error('weather-web: request aborted')
    const controller = new AbortController()
    const onAbort = (): void => { controller.abort(request.signal?.reason) }
    request.signal?.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => { controller.abort(new Error('weather-web: request timed out')) }, this.config.timeoutMs)
    try {
      const response = await fetch(`${this.config.apiUrl}/${encodeURIComponent(location)}`, { signal: controller.signal })
      if (!response.ok) throw new Error(`weather-web: endpoint answered ${response.status}`)
      const payload = parseForecast(await response.json())
      return { location, temperatureC: payload.temperatureC, condition: payload.condition }
    } finally {
      clearTimeout(timer)
      request.signal?.removeEventListener('abort', onAbort)
    }
  }
}

export default WebWeatherService
