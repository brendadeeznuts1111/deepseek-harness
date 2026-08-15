/**
 * The `ctx.weather` capability seam plus its tutorial providers and tools.
 * The package default export is the Service Definition class; providers and
 * consumers load through their own subpath plugins.
 * @module @deepseek-ai/dsh-tutorial-tools
 */

export { WeatherService, default } from './weather.ts'
export type { WeatherRequest, WeatherResult } from './weather.ts'
export { LocalWeatherService } from './weather-local.ts'
export type { Config as LocalWeatherConfig, PlaceOverride } from './weather-local.ts'
export { WebWeatherService } from './weather-web.ts'
export type { Config as WebWeatherConfig } from './weather-web.ts'
