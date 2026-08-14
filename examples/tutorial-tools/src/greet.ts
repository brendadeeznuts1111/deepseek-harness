import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { CallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import { z } from 'zod'
import { defineDomain, type Domain } from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-storage'
import type {} from '@deepseek-ai/dsh-agent-default-model'

export const name = 'greet-tool-llm'
export const inject = ['tools', 'llm', 'agentDefaultModel']

// Optional durable memory via the storage domain form. Storage is NOT a hard
// requirement: headless profiles may not mount it, so the plugin probes
// ctx.get('storage') at the use site (chapter 3: inject only hard deps).
const greetMemorySpec = defineDomain({
  name: 'tutorial_greet',
  version: 0,
  global: {
    schema: z.object({ last: z.string() }),
    initial: { last: '' },
  },
  tables: {
    people: {
      valueSchema: z.object({
        location: z.string(),
        greetedAt: z.number(),
      }),
    },
  },
})

type GreetMemoryDomain = Domain<typeof greetMemorySpec>

export function apply(ctx: Context) {
  // Lazily-opened domain handle; closed on plugin unload. The facility
  // enforces single-open per name, and open() loads all records, so open once.
  let domain: GreetMemoryDomain | undefined

  async function ensureMemory(): Promise<GreetMemoryDomain | undefined> {
    if (domain) return domain
    const storage = ctx.get('storage')
    if (storage === undefined) return undefined
    domain = await storage.domain.open(greetMemorySpec)
    return domain
  }

  ctx.effect(() => () => { void domain?.close() })

  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet someone by name with a warm, model-generated message, optionally folding in the weather for a location. Remembers the last person greeted and each person\'s last location.',
    parameters: {
      name: { type: 'string', description: 'The name of the person to greet; defaults to the last remembered greeter' },
      location: { type: 'string', description: 'Optional city or place whose weather should flavor the greeting; defaults to the remembered location for this person' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const memory = await ensureMemory()
      const table = memory?.table('people')

      // 1. Resolve the name: explicit, or the last remembered greeter.
      const name = args.name?.trim() || memory?.global.get().last || ''
      if (name === '') {
        throw new Error('greet: no name given and no remembered greeter')
      }

      // 2. Resolve the location: explicit, or remembered for this person.
      const remembered = table?.get(name.toLowerCase())
      const location = args.location ?? remembered?.location

      // 3. Optional tool-to-tool sub-dispatch: ask the weather tool for
      // context through the same registry pipeline.
      let weatherContext = ''
      if (location !== undefined && location !== '') {
        const weatherResult = await ctx.tools.execute({
          callId: CallId(crypto.randomUUID()),
          name: 'weather',
          arguments: { location },
          signal: exec.signal,
        })
        if (!weatherResult.isError) {
          const w = weatherResult.value as { location: string; temperatureC: number; condition: string }
          weatherContext = ` It is ${w.temperatureC}°C with ${w.condition} in ${w.location}.`
        }
      }

      // 4. Resolve the inner call's provider/model from the agent's own
      // selection, falling back to the composition default.
      const agentSelection = exec.agent?.options
      const fallback = ctx.agentDefaultModel.currentSelection()
      const provider = agentSelection?.provider ?? fallback.provider
      const model = agentSelection?.model ?? fallback.model

      const prompt = `Write a warm, one-sentence greeting for ${name}. Be creative but keep it under 20 words.`
        + (weatherContext === ''
          ? ''
          : ` Weather context:${weatherContext} Mention the weather naturally if it fits.`)

      // 5. One auxiliary model call through the real LLM pipeline.
      let greeting = ''
      for await (const chunk of ctx.llm.stream({
        provider,
        model,
        messages: [createUserMessage({
          content: [{ type: 'text', text: prompt }],
          source: { kind: 'user' },
        })],
        signal: exec.signal,
      })) {
        if (chunk.type === 'text-delta') greeting += chunk.text
        else if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
          throw new Error(`greet: inner LLM call ended with reason ${chunk.reason.kind}`)
        }
      }
      greeting ||= `Hello, ${name}!`

      // 6. Persist: remember this person and mark them the last greeter.
      if (memory && table) {
        await table.put(name.toLowerCase(), { location: location ?? '', greetedAt: Date.now() })
        await memory.global.set({ last: name })
      }

      return greeting
    },
  }))
}
