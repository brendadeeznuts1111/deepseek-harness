/**
 * Model-facing Consumer of the `ctx.bun` capability seam. Background calls
 * register process handles with `ctx.jobs`.
 * @module @deepseek-ai/dsh-tool-bun
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { isAbsolute, resolve as resolvePath } from 'node:path'
import { defineTool, TOOL_ABORTED } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, TerminalCallView, ToolResult, ToolResultView } from '@deepseek-ai/dsh-tools'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-jobs'

declare module '@deepseek-ai/dsh-jobs' {
  interface JobKindMap {
    bun: 'bun'
  }
}
import type {} from '@deepseek-ai/dsh-shell-env'
import { DSH_ENV_PREFIX } from '@deepseek-ai/dsh-bun'
import type { BunRunResult } from '@deepseek-ai/dsh-bun'
import { processOutcome } from './background.ts'
import { parseExitStatus, renderProcessRead, renderResult } from './render.ts'

export const name = 'tool-bun'
export const inject = ['tools', 'bun', 'systemPrompt', 'shellEnv']

/** Configuration for the bun tool. */
export interface Config {
  /** Expose `run_in_background` (default true); disabled calls are also rejected. */
  enableRunInBackground?: boolean
}

/** Runtime configuration schema for the bun tool plugin. */
export const Config: z<Config> = z.object({
  enableRunInBackground: z.boolean().default(true),
})

interface BunToolArgs {
  args: string[]
  description: string
  timeoutMs?: number
  workdir?: string
  run_in_background?: boolean
}

function validateBunArgs(args: BunToolArgs): void {
  if (args.args.length === 0 || args.args.some(part => part.trim().length === 0)) {
    throw new Error('invalid args: expected a non-empty list of non-empty strings')
  }
  if (args.description.trim().length === 0) {
    throw new Error('invalid description: expected a non-empty string')
  }
  if (args.timeoutMs !== undefined && (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0)) {
    throw new Error(`invalid timeoutMs: expected a positive number, got ${JSON.stringify(args.timeoutMs)}`)
  }
}

function bunDescription(backgroundEnabled: boolean): string {
  const background = backgroundEnabled
    ? 'Set `run_in_background: true` for long-running invocations: the call returns a job id immediately; read its output with `job_output` and stop it with `job_kill`.'
    : 'Background execution is not available; long-running invocations must finish within the timeout.'
  return 'Invoke the host `bun` executable with the given argument list (not a shell string). '
    + 'Each call is a fresh process: no cwd or environment persists between calls — pass `workdir` instead of using `cd`. '
    + 'Typical args: `["--version"]`, `["run", "script.ts"]`, `["test"]`. '
    + 'Non-zero exits are reported as `[exit code: N]`. '
    + `Current harness environment facts are exposed through managed \`$${DSH_ENV_PREFIX}*\` variables. `
    + 'Long output is truncated to its tail; the full output is saved to a file whose path is reported when available. '
    + background
}

type BunCallArgs = { args: string[]; description: string; workdir?: string; run_in_background?: boolean }

function formatArgs(args: string[]): string {
  return ['bun', ...args].join(' ')
}

function presentBunCall(args: BunCallArgs): GenericCallView | TerminalCallView {
  const title = formatArgs(args.args)
  if (args.run_in_background === true) {
    return {
      card: 'generic',
      title,
      kind: 'execute',
      rawInput: title,
      content: [{ type: 'text', text: args.description }],
    }
  }
  return {
    card: 'terminal',
    title,
    description: args.description,
    ...args.workdir !== undefined ? { cwd: args.workdir } : {},
  }
}

function presentBunResult(args: unknown, result: ToolResult): ToolResultView | undefined {
  const block = result.content.length === 1 ? result.content[0] : undefined
  if (block === undefined || block.type !== 'text') return undefined
  const raw = block.text
  const isBackground = typeof args === 'object' && args !== null
    && (args as { run_in_background?: unknown }).run_in_background === true
  if (isBackground || result.isError) {
    return { card: 'generic', content: [{ type: 'text', text: `\`\`\`console\n${raw.replace(/\n+$/, '')}\n\`\`\`` }] }
  }
  const { body, ...exit } = parseExitStatus(raw)
  return { card: 'terminal', output: body, ...exit }
}

function resolveWorkdir(modelWorkdir: string | undefined, exec: { agent?: Agent }): string | undefined {
  const headerCwd = exec.agent?.session.header.cwd
  if (modelWorkdir === undefined) return headerCwd
  if (headerCwd !== undefined && !isAbsolute(modelWorkdir)) {
    return resolvePath(headerCwd, modelWorkdir)
  }
  return modelWorkdir
}

function canonicalBunResult(result: BunRunResult) {
  const output = (stream: BunRunResult['stdout']) => ({
    text: stream.text,
    truncated: stream.truncated,
    ...stream.spillPath !== undefined ? { spillPath: stream.spillPath } : {},
  })
  return {
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    aborted: result.aborted,
    timeoutMs: result.timeoutMs,
    stdout: output(result.stdout),
    stderr: output(result.stderr),
  }
}

const BACKGROUND_OUTPUT_PROPERTIES = {
  kind: { type: 'string', required: true, const: 'background' },
  jobId: { type: 'string', required: true },
} as const

export function apply(ctx: Context, config: Config = {}): void {
  const backgroundEnabled = config.enableRunInBackground ?? true
  ctx.systemPrompt.section({
    name: 'tool:bun',
    order: 106,
    text: 'Check the [exit code: N] marker on every bun result; investigate failures before moving on. Use `args` as a list, not a shell string.',
  })
  ctx.tools.register(defineTool({
    name: 'bun',
    description: bunDescription(backgroundEnabled),
    parameters: {
      args: {
        type: 'array',
        required: true,
        items: { type: 'string' },
        description: 'Arguments after the bun executable, for example ["--version"] or ["run", "script.ts"].',
      },
      description: {
        type: 'string',
        required: true,
        description: 'Clear, concise description of what this invocation does in active voice, 5-10 words.',
      },
      timeoutMs: {
        type: 'number',
        description: 'Timeout in milliseconds. The executor applies its configured default and cap.',
      },
      workdir: {
        type: 'string',
        description: 'Working directory for this invocation. Defaults to the session workspace.',
      },
      ...backgroundEnabled ? {
        run_in_background: {
          type: 'boolean' as const,
          description: 'Run in the background and return a job id immediately. No timeout applies.',
        },
      } : {},
    },
    output: {
      schema: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            properties: BACKGROUND_OUTPUT_PROPERTIES,
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', required: true, const: 'foreground' },
              exitCode: { required: true, oneOf: [{ type: 'integer' }, { type: 'null' }] },
              signal: { required: true, oneOf: [{ type: 'string' }, { type: 'null' }] },
              timedOut: { type: 'boolean', required: true },
              aborted: { type: 'boolean', required: true },
              timeoutMs: { type: 'number', required: true },
              stdout: {
                type: 'object',
                additionalProperties: false,
                required: true,
                properties: {
                  text: { type: 'string', required: true },
                  truncated: { type: 'boolean', required: true },
                  spillPath: { type: 'string' },
                },
              },
              stderr: {
                type: 'object',
                additionalProperties: false,
                required: true,
                properties: {
                  text: { type: 'string', required: true },
                  truncated: { type: 'boolean', required: true },
                  spillPath: { type: 'string' },
                },
              },
            },
          },
        ],
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.kind === 'background'
          ? `started background job ${value.jobId}`
          : renderResult(value as { kind: 'foreground' } & BunRunResult),
      }],
    },
    async execute(args: BunToolArgs, exec) {
      validateBunArgs(args)
      const workdir = resolveWorkdir(args.workdir, exec)
      const dshEnv = ctx.shellEnv.collect(exec)
      const request = {
        args: args.args,
        ...workdir !== undefined ? { workdir } : {},
        ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {},
        dshEnv,
      }
      if (args.run_in_background === true) {
        if (!backgroundEnabled) {
          throw new Error('run_in_background is disabled for this deployment (enableRunInBackground: false)')
        }
        const jobs = ctx.get('jobs')
        if (jobs === undefined) {
          throw new Error('background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs')
        }
        /* v8 ignore start -- the registry rejects a pre-aborted signal before dispatch; this is the in-body race. */
        if (exec.signal.aborted) {
          const error = new HarnessError('tool call aborted', TOOL_ABORTED)
          error.name = 'AbortError'
          throw error
        }
        /* v8 ignore stop */
        const id = jobs.start({
          kind: 'bun',
          label: formatArgs(args.args),
          ...exec.agent ? { owner: exec.agent } : {},
          run: () => {
            const proc = ctx.bun.start(ctx.bun.resolve(request))
            return {
              cancel: () => void proc.kill(),
              done: proc.done.then(() => processOutcome(proc)),
              readOutput: () => renderProcessRead(proc.readOutput()),
            }
          },
        })
        return { kind: 'background' as const, jobId: id }
      }
      const result = await ctx.bun.run(ctx.bun.resolve({
        ...request,
        signal: exec.signal,
      }))
      if (result.aborted) {
        const error = new HarnessError('tool call aborted', TOOL_ABORTED)
        error.name = 'AbortError'
        throw error
      }
      return { kind: 'foreground' as const, ...canonicalBunResult(result) }
    },
    presentCall: presentBunCall,
    presentResult: presentBunResult,
  }))
}
