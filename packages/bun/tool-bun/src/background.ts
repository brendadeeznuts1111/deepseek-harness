/**
 * Generic-task adaptation for background Bun process handles.
 * @module @deepseek-ai/dsh-tool-bun/background
 */

import type { BunProcess } from '@deepseek-ai/dsh-bun'

/**
 * Map a settled background process onto the generic task-outcome vocabulary.
 * @param proc - the settled process handle.
 * @returns the outcome for the `ctx.jobs` registration.
 */
export function processOutcome(proc: BunProcess): { status: 'completed' | 'killed'; detail: string } {
  if (proc.status === 'killed') {
    return { status: 'killed', detail: proc.signal !== null ? `signal: ${proc.signal}` : 'killed before exit' }
  }
  return { status: 'completed', detail: `exit code: ${proc.exitCode ?? 0}` }
}
