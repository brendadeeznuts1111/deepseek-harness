import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebWeatherService, { type Config } from '../src/weather-web.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(impl: (input: unknown, init?: RequestInit) => Promise<Response>): void {
  vi.stubGlobal('fetch', vi.fn(impl))
}

async function mount(config?: Partial<Config>) {
  const ctx = new Context()
  await ctx.plugin(WebWeatherService, { apiUrl: 'https://weather.example', ...config })
  return ctx
}

describe('weather-web provider', () => {
  it('resolves a forecast from the endpoint', async () => {
    stubFetch(async () => new Response(JSON.stringify({ temperatureC: 12, condition: 'windy' }), { status: 200 }))
    const ctx = await mount()
    await expect(ctx.weather.get({ location: '  Berlin  ' })).resolves.toEqual({
      location: 'Berlin',
      temperatureC: 12,
      condition: 'windy',
    })
  })

  it('rejects an empty location before any request', async () => {
    stubFetch(async () => new Response('{}', { status: 200 }))
    const ctx = await mount()
    await expect(ctx.weather.get({ location: ' ' })).rejects.toThrow('weather-web: location must not be empty')
  })

  it('rejects an already-aborted caller signal', async () => {
    const ctx = await mount()
    const controller = new AbortController()
    controller.abort(new Error('caller gave up'))
    await expect(ctx.weather.get({ location: 'Berlin', signal: controller.signal })).rejects.toThrow('weather-web: request aborted')
  })

  it('forwards a caller abort to the in-flight request', async () => {
    stubFetch((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { reject(new Error(String(init.signal?.reason))) })
    }))
    const ctx = await mount()
    const controller = new AbortController()
    const pending = ctx.weather.get({ location: 'Berlin', signal: controller.signal })
    controller.abort(new Error('caller gave up'))
    await expect(pending).rejects.toThrow('caller gave up')
  })

  it('times out a stalled request', async () => {
    stubFetch((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { reject(new Error(String(init.signal?.reason))) })
    }))
    const ctx = await mount({ timeoutMs: 5 })
    await expect(ctx.weather.get({ location: 'Berlin' })).rejects.toThrow('weather-web: request timed out')
  })

  it('rejects a non-ok endpoint answer', async () => {
    stubFetch(async () => new Response('oops', { status: 503 }))
    const ctx = await mount()
    await expect(ctx.weather.get({ location: 'Berlin' })).rejects.toThrow('weather-web: endpoint answered 503')
  })

  it('rejects a non-object JSON body', async () => {
    stubFetch(async () => new Response('"plain"', { status: 200 }))
    const ctx = await mount()
    await expect(ctx.weather.get({ location: 'Berlin' })).rejects.toThrow('weather-web: endpoint answered non-JSON-object')
  })

  it('rejects a body missing the forecast fields', async () => {
    stubFetch(async () => new Response(JSON.stringify({ temperatureC: 'warm' }), { status: 200 }))
    const ctx = await mount()
    await expect(ctx.weather.get({ location: 'Berlin' })).rejects.toThrow('weather-web: response must carry numeric temperatureC and string condition')
  })

  it('propagates a network failure', async () => {
    stubFetch(async () => { throw new Error('network unreachable') })
    const ctx = await mount()
    await expect(ctx.weather.get({ location: 'Berlin' })).rejects.toThrow('network unreachable')
  })

  it('rejects unusable config in the constructor', async () => {
    const ctx = new Context()
    await expect(ctx.plugin(WebWeatherService, { apiUrl: 'https://weather.example', timeoutMs: 0 })).rejects.toThrow('weather-web: timeoutMs must be a positive finite number')
    await expect(ctx.plugin(WebWeatherService, { apiUrl: '   ' })).rejects.toThrow('weather-web: apiUrl must not be empty')
    await expect(ctx.plugin(WebWeatherService, { apiUrl: 'https://weather.example', timeoutMs: 500 })).resolves.toBeDefined()
  })
})
