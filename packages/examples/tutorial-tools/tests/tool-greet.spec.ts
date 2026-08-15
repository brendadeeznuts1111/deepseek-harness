import { describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolResult } from '@deepseek-ai/dsh-tools'
import { CallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import Storage from '@deepseek-ai/dsh-storage'
import * as JsonStorage from '@deepseek-ai/dsh-storage-json'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import { WeatherService, type WeatherRequest, type WeatherResult } from '../src/index.ts'
import * as ToolGreet from '../src/tool-greet.ts'

/** Scriptable fake of the `ctx.llm` service; records the options it was asked for. */
class FakeLlm extends Service {
  chunks: StreamChunk[]
  seen: GenerateOptions[] = []

  constructor(ctx: Context, chunks: StreamChunk[] = []) {
    super(ctx, 'llm')
    this.chunks = chunks
  }

  stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.seen.push(options)
    const chunks = this.chunks
    return (async function* () {
      for (const chunk of chunks) yield chunk
    })()
  }
}

/** Fake of the `ctx.agentDefaultModel` service. */
class FakeAgentDefaultModel extends Service {
  constructor(ctx: Context, private readonly selection: { provider: string; model: string }) {
    super(ctx, 'agentDefaultModel')
  }

  currentSelection(): { provider: string; model: string } {
    return this.selection
  }
}

/** Fake weather provider recording every lookup; can fail or pin a result. */
class FakeWeather extends WeatherService {
  calls: WeatherRequest[] = []
  result?: WeatherResult
  failWith?: Error

  async get(request: WeatherRequest): Promise<WeatherResult> {
    this.calls.push(request)
    if (this.failWith) throw this.failWith
    return this.result ?? { location: request.location, temperatureC: 20, condition: 'clear' }
  }
}

interface HarnessOptions {
  chunks?: StreamChunk[]
  selection?: { provider: string; model: string }
  weatherFail?: Error
  storageRoot?: string
  config?: Record<string, unknown>
}

async function harness(options: HarnessOptions = {}) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(FakeLlm, options.chunks ?? [])
  await ctx.plugin(FakeAgentDefaultModel, options.selection ?? { provider: 'deepseek-official', model: 'deepseek-v4-flash' })
  await ctx.plugin(FakeWeather)
  if (options.storageRoot !== undefined) {
    await ctx.plugin(Storage)
    await ctx.plugin(JsonStorage, { root: options.storageRoot })
    await ctx.plugin(StorageDomain, { backend: 'json' })
  }
  const fiber = await ctx.plugin(ToolGreet, options.config ?? {})
  const weather = ctx.weather as FakeWeather
  if (options.weatherFail !== undefined) weather.failWith = options.weatherFail
  return { ctx, fiber, weather, llm: ctx.llm as unknown as FakeLlm }
}

async function runGreet(ctx: Context, args: Record<string, unknown>, agent?: { provider?: string; model?: string }): Promise<ToolResult> {
  return ctx.tools.execute({
    callId: CallId('greet-test'),
    name: 'greet',
    arguments: args,
    signal: new AbortController().signal,
    ...agent !== undefined ? { agent: { options: agent } as never } : {},
  })
}

function textOf(result: ToolResult): string {
  return result.content.map(block => (block.type === 'text' ? block.text : '')).join('')
}

function lastRequest(llm: FakeLlm): GenerateOptions {
  const options = llm.seen.at(-1)
  if (options === undefined) throw new Error('no LLM request captured')
  return options
}

function valueOf(result: ToolResult): unknown {
  if ('value' in result) return result.value
  throw new Error(`unexpected tool error: ${textOf(result)}`)
}

function promptText(llm: FakeLlm): string {
  const content = lastRequest(llm).messages[0]?.content
  return typeof content === 'string' ? content : JSON.stringify(content ?? '')
}

const delta = (text: string): StreamChunk => ({ type: 'text-delta', index: 0, text })
const stop = { type: 'finish', reason: { kind: 'stop' } } as unknown as StreamChunk
const error = { type: 'finish', reason: { kind: 'error', failure: { code: 'E', message: 'boom' } } } as unknown as StreamChunk
const aborted = { type: 'finish', reason: { kind: 'aborted', failure: { code: 'A', message: 'abort' } } } as unknown as StreamChunk
const usage = { type: 'usage', usage: {} } as unknown as StreamChunk

describe('tool-greet consumer', () => {
  it('registers the greet tool with a pending-card presentation', async () => {
    const { ctx } = await harness()
    const tool = ctx.tools.get('greet')
    expect(tool).toBeDefined()
    expect(tool?.presentCall?.({ name: 'Ada' })).toEqual({ card: 'generic', title: 'Greet Ada', kind: 'execute' })
    expect(tool?.presentCall?.({ name: '   ' })).toMatchObject({ title: 'Greet the remembered person' })
    expect(tool?.presentCall?.({})).toMatchObject({ title: 'Greet the remembered person' })
  })

  it('greets an explicit name with the model stream and no weather', async () => {
    const { ctx, llm, weather } = await harness({ chunks: [delta('Hi '), delta('Ada!'), stop] })
    const result = await runGreet(ctx, { name: 'Ada' })
    expect(result.isError).toBe(false)
    expect(valueOf(result)).toBe('Hi Ada!')
    expect(textOf(result)).toBe('Hi Ada!')
    expect(weather.calls).toEqual([])
    expect(lastRequest(llm).provider).toBe('deepseek-official')
    expect(lastRequest(llm).model).toBe('deepseek-v4-flash')
  })

  it('flavors the greeting with the weather for the location', async () => {
    const { ctx, llm, weather } = await harness({ chunks: [delta('Hi Ada!'), stop] })
    const result = await runGreet(ctx, { name: 'Ada', location: 'London' })
    expect(result.isError).toBe(false)
    expect(weather.calls).toHaveLength(1)
    expect(weather.calls[0]?.location).toBe('London')
    expect(weather.calls[0]?.signal).toBeDefined()
    expect(promptText(llm)).toContain('20°C with clear in London')
  })

  it('keeps greeting when the weather provider fails', async () => {
    const { ctx, llm } = await harness({ chunks: [delta('Hi Ada!'), stop], weatherFail: new Error('provider down') })
    const result = await runGreet(ctx, { name: 'Ada', location: 'Berlin' })
    expect(result.isError).toBe(false)
    expect(promptText(llm)).not.toContain('weather')
  })

  it('prefers the agent selection over the composition default', async () => {
    const { ctx, llm } = await harness({ chunks: [stop] })
    await runGreet(ctx, { name: 'Ada' }, { provider: 'agent-provider', model: 'agent-model' })
    expect(lastRequest(llm).provider).toBe('agent-provider')
    expect(lastRequest(llm).model).toBe('agent-model')
  })

  it('falls back to the default when the agent selection is empty', async () => {
    const { ctx, llm } = await harness({ chunks: [stop] })
    await runGreet(ctx, { name: 'Ada' }, {})
    expect(lastRequest(llm).provider).toBe('deepseek-official')
  })

  it('rejects a finished-with-error model call', async () => {
    const { ctx } = await harness({ chunks: [error] })
    const result = await runGreet(ctx, { name: 'Ada' })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('reason error')
  })

  it('rejects an aborted model call', async () => {
    const { ctx } = await harness({ chunks: [aborted] })
    const result = await runGreet(ctx, { name: 'Ada' })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('reason aborted')
  })

  it('falls back to the configured template when the model yields no text', async () => {
    const { ctx } = await harness({ chunks: [stop] })
    const result = await runGreet(ctx, { name: 'Ada' })
    expect(valueOf(result)).toBe('Hello, Ada!')
  })

  it('applies the configurable fallback template and word budget', async () => {
    const { ctx, llm } = await harness({ chunks: [stop], config: { fallbackGreeting: 'Hey {name}!', maxWords: 5 } })
    const result = await runGreet(ctx, { name: 'Ada' })
    expect(valueOf(result)).toBe('Hey Ada!')
    expect(promptText(llm)).toContain('under 5 words')
  })

  it('ignores non-text chunks while streaming', async () => {
    const { ctx } = await harness({ chunks: [usage, delta('Hi'), stop] })
    const result = await runGreet(ctx, { name: 'Ada' })
    expect(valueOf(result)).toBe('Hi')
  })

  it('errors when no name is given and nothing is remembered', async () => {
    const { ctx } = await harness({ chunks: [stop] })
    const result = await runGreet(ctx, { name: '   ' })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('no name given and no remembered greeter')
  })

  it('remembers the last greeter and their location through storage', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tutorial-greet-'))
    try {
      const { ctx } = await harness({ chunks: [delta('Hi Ada!'), stop], storageRoot: root })
      const first = await runGreet(ctx, { name: 'Ada', location: 'London' })
      expect(first.isError).toBe(false)
      // Second call: no name, no location — recalls Ada and London.
      const second = await runGreet(ctx, {})
      expect(valueOf(second)).toBe('Hi Ada!')
      const weather = ctx.weather as FakeWeather
      expect(weather.calls).toHaveLength(2)
      expect(weather.calls[1]?.location).toBe('London')
      // Third call: whitespace name also falls back to the remembered greeter.
      const third = await runGreet(ctx, { name: '   ' })
      expect(valueOf(third)).toBe('Hi Ada!')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('runs stateless without storage', async () => {
    const { ctx } = await harness({ chunks: [delta('Hi Ada!'), stop] })
    const first = await runGreet(ctx, { name: 'Ada' })
    expect(first.isError).toBe(false)
    const second = await runGreet(ctx, {})
    expect(second.isError).toBe(true)
  })

  it('disposes the memory domain when unloaded, with or without storage', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tutorial-greet-'))
    try {
      const withStorage = await harness({ chunks: [delta('Hi'), stop], storageRoot: root })
      await runGreet(withStorage.ctx, { name: 'Ada' })
      await expect(withStorage.fiber.dispose()).resolves.toBeUndefined()
      const withoutStorage = await harness({ chunks: [stop] })
      await expect(withoutStorage.fiber.dispose()).resolves.toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
