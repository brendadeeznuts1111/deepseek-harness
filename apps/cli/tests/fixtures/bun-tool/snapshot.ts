import { fileURLToPath } from 'node:url'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
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
  // Tool execution only needs the Session-backed identity; the full Agent surface is driver-owned.
  const agent = { id: agentId, session } as unknown as Agent
  const schemas = ctx.tools.schemas(agent)
  const tools = schemas.map(schema => schema.name).sort()
  const bunSchema = schemas.find(schema => schema.name === 'bun')
  const batch = await ctx.tools.execute({
    calls: [{
      type: 'tool-call',
      id: ToolCallId('bun-tool-snapshot'),
      name: 'bun',
      arguments: JSON.stringify({ args: [stubPath, '--version'], description: 'Print stub bun version' }),
    }],
    signal: new AbortController().signal,
    agent,
  })
  const result = batch.results[0]
  process.stdout.write(`${JSON.stringify({ tools, bunDescription: bunSchema?.description ?? null, result })}\n`)
} finally {
  await ctx.fiber.dispose()
}
