import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { Inbox, type Agent } from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import { boot, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-tools'

const overlayPath = process.argv[2]
if (overlayPath === undefined) throw new Error('bun-tool snapshot requires an overlay path')
const rootConfigPath = fileURLToPath(new URL('../../../../../packages/bundle/base/tests/fixtures/root.cordis.yml', import.meta.url))
const basePatchPath = fileURLToPath(new URL('../../../../../packages/bundle/base/cordis.patch.yml', import.meta.url))
const stubPath = fileURLToPath(new URL('../../../../../packages/bun/bun-local/tests/fixtures/bun-stub.mjs', import.meta.url))
const ctx = await boot('bun-tool-snapshot', rootConfigPath, [
  ...loadOverlayPatches('bun-tool-snapshot', basePatchPath),
  ...loadOverlayPatches('bun-tool-snapshot', overlayPath),
])

try {
  const agentId = SessionId('bun-tool-snapshot')
  const session = ctx.sessions.create(agentId, { meta: { cwd: process.cwd() } })
  const agent: Agent = {
    ctx: new Context(),
    id: agentId,
    options: {},
    session,
    inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'idle',
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject: () => { throw new Error('bun-tool snapshot does not inject') },
    cancel: () => {},
    runMaintenance: job => job(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  const tools = ctx.tools.schemas(agent).map(schema => schema.name).sort()
  const bunSchema = ctx.tools.schemas(agent).find(schema => schema.name === 'bun')
  const result = await ctx.tools.execute({
    callId: CallId('bun-tool-snapshot'),
    name: 'bun',
    arguments: { args: [stubPath, '--version'], description: 'Print stub bun version' },
    signal: new AbortController().signal,
    agent,
  })
  process.stdout.write(`${JSON.stringify({ tools, bunDescription: bunSchema?.description ?? null, result })}\n`)
} finally {
  await ctx.fiber.dispose()
}
