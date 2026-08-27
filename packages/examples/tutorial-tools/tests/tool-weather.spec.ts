import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { ToolCallId as CallId } from '@deepseek-ai/dsh-llm'
import LocalWeatherService from '../src/weather-local.ts'
import * as ToolWeather from '../src/tool-weather.ts'

async function harness() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LocalWeatherService, { overrides: { london: { temperatureC: 14, condition: 'drizzling' } } })
  await ctx.plugin(ToolWeather)
  return ctx
}

const signal = new AbortController().signal

describe('tool-weather consumer', () => {
  it('registers the weather tool and executes through the registry', async () => {
    const ctx = await harness()
    const result = await ctx.tools.execute({
      callId: CallId('tw-1'),
      name: 'weather',
      arguments: { location: 'London' },
      signal,
    })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('unexpected tool error')
    expect(result.value).toEqual({ location: 'London', temperatureC: 14, condition: 'drizzling' })
    expect(result.content).toEqual([{ type: 'text', text: '14°C, drizzling in London' }])
  })

  it('hand-checks an empty location as an error result', async () => {
    const ctx = await harness()
    const result = await ctx.tools.execute({
      callId: CallId('tw-2'),
      name: 'weather',
      arguments: { location: '   ' },
      signal,
    })
    expect(result.isError).toBe(true)
  })

  it('declares generic call and result cards and replayable meta', async () => {
    const ctx = await harness()
    const tool = ctx.tools.get('weather')
    expect(tool?.presentCall?.({ location: 'London' })).toEqual({
      card: 'generic',
      title: 'Weather in London',
      kind: 'fetch',
      rawInput: 'London',
    })
    expect(tool?.presentCall?.({ location: '' })).toMatchObject({ title: 'Weather' })
    // Soft validation: malformed logged args fall back to undefined rather than throw.
    expect(tool?.presentCall?.({})).toBeUndefined()
    const value = { location: 'London', temperatureC: 14, condition: 'drizzling' }
    expect(tool?.output.presentationMeta?.({ location: 'London' }, value)).toEqual(value)
    expect(tool?.output.render?.({ location: 'London' }, value)).toEqual([{ type: 'text', text: '14°C, drizzling in London' }])
    expect(tool?.presentResult?.({ location: 'London' }, { content: [], isError: false })).toEqual({
      card: 'generic',
      title: 'Forecast for London',
      content: [],
    })
    expect(tool?.presentResult?.({ location: '' }, { content: [], isError: false })).toMatchObject({ title: 'Weather' })
    expect(tool?.presentResult?.({ location: 'London' }, { content: [], isError: true })).toBeUndefined()
  })
})
