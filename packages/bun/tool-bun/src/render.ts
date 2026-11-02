/**
 * Model-facing result rendering for the bun tool.
 * @module @deepseek-ai/dsh-tool-bun/render
 */

import type { BunProcessRead, BunRunResult, CollectedOutput } from '@deepseek-ai/dsh-bun'

function streamText(output: CollectedOutput): string {
  if (!output.truncated) return output.text
  return `${output.text}\n[output truncated; full output: ${output.spillPath ?? '(unavailable)'}]`
}

/**
 * Shape one finished Bun run into the text the model sees.
 * @param result - the completed foreground run from the executor.
 * @returns stdout, optional stderr section, then timeout/signal/exit markers.
 */
export function renderResult(result: BunRunResult): string {
  const out = streamText(result.stdout)
  const err = streamText(result.stderr)
  let body = out
  if (err.length > 0) {
    if (body.length > 0 && !body.endsWith('\n')) body += '\n'
    body += `[stderr]\n${err}`
  }
  if (body.length === 0) body = '(no output)'
  const markers: string[] = []
  if (result.timedOut) markers.push(`[timed out after ${result.timeoutMs}ms]`)
  if (result.signal !== null) {
    markers.push(`[killed by signal: ${result.signal}]`)
  } else if (result.exitCode !== 0) {
    markers.push(`[exit code: ${result.exitCode}]`)
  }
  if (markers.length === 0) return body
  if (!body.endsWith('\n')) body += '\n'
  return body + markers.join('\n')
}

/**
 * Split rendered text into the terminal card body and an optional exit pill.
 * @param raw - model-facing result text from {@link renderResult}.
 * @returns body plus optional exitCode or signal.
 */
export function parseExitStatus(raw: string): { body: string; exitCode?: number; signal?: string } {
  const exit = raw.match(/\n\[exit code: ([^\]]+)\]$/)
  if (exit !== null) {
    return { body: raw.slice(0, exit.index), exitCode: Number(exit[1]) }
  }
  const signal = raw.match(/\n\[killed by signal: ([^\]]+)\]$/)
  if (signal !== null && signal[1] !== undefined) {
    return { body: raw.slice(0, signal.index), signal: signal[1] }
  }
  return { body: raw }
}

/**
 * Shape one background-process read into a `job_output` delta.
 * @param read - one incremental read from the process handle.
 * @returns the delta text with any loss notice appended.
 */
export function renderProcessRead(read: BunProcessRead): string {
  if (!read.lossy) return read.delta
  const stdout = read.stdoutSpillPath ?? '(unavailable)'
  const stderr = read.stderrSpillPath ?? '(unavailable)'
  const notice = `[output truncated; full stdout: ${stdout}; full stderr: ${stderr}]`
  if (read.delta.length === 0) return notice
  return read.delta.endsWith('\n') ? `${read.delta}${notice}` : `${read.delta}\n${notice}`
}
