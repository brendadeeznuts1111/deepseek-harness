import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const binScript = fileURLToPath(new URL('./fixtures/bun-tool/snapshot.ts', import.meta.url))
const configPath = fileURLToPath(new URL('./fixtures/bun-tool/cordis.yml', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const stubPath = fileURLToPath(new URL('../../../packages/bun/bun-local/tests/fixtures/bun-stub.mjs', import.meta.url))

describe('bun tool assembled snapshot', () => {
  it('registers bun beside bash and executes the model-visible bun tool', async () => {
    const assembled = await runLoaderSmoke({
      label: 'bun tool snapshot',
      tempDirPrefix: 'headless-snapshot-bun-tool-',
      binScript,
      libBinScript: binScript,
      configPath,
      tsconfigPath,
    })
    const snapshot = JSON.parse(assembled.stdout.replaceAll(stubPath, '{{bunStubPath}}')) as unknown

    expect(assembled.stderr).toBe('')
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "bunDescription": "Invoke the host \`bun\` executable with the given argument list (not a shell string). Each call is a fresh process: no cwd or environment persists between calls — pass \`workdir\` instead of using \`cd\`. Typical args: \`["--version"]\`, \`["run", "script.ts"]\`, \`["test"]\`. Non-zero exits are reported as \`[exit code: N]\`. Current harness environment facts are exposed through managed \`$DSH_*\` variables. Long output is truncated to its tail; the full output is saved to a file whose path is reported when available. Set \`run_in_background: true\` for long-running invocations: the call returns a job id immediately; read its output with \`job_output\` and stop it with \`job_kill\`.",
        "result": {
          "content": [
            {
              "text": "1.2.3
      ",
              "type": "text",
            },
          ],
          "isError": false,
          "value": {
            "aborted": false,
            "exitCode": 0,
            "kind": "foreground",
            "signal": null,
            "stderr": {
              "text": "",
              "truncated": false,
            },
            "stdout": {
              "text": "1.2.3
      ",
              "truncated": false,
            },
            "timedOut": false,
            "timeoutMs": 120000,
          },
        },
        "tools": [
          "bash",
          "bun",
          "create_goal",
          "edit",
          "exit_plan_mode",
          "get_goal",
          "glob",
          "grep",
          "interrupt_agent",
          "job_kill",
          "job_list",
          "job_output",
          "list_agents",
          "ralph",
          "read",
          "read_image",
          "send_message",
          "skill",
          "str_replace_editor",
          "subagent",
          "subagent_fork",
          "todo_write",
          "update_goal",
          "web_search",
          "workflow",
          "write",
        ],
      }
    `)
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
