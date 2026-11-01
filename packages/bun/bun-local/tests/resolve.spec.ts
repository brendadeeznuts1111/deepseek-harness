import { chmodSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findBunOnPath, resolveBunPath } from '@deepseek-ai/dsh-bun-local'

describe('resolveBunPath', () => {
  it('accepts an existing configured path and rejects a missing one', () => {
    expect(resolveBunPath(process.execPath)).toBe(process.execPath)
    expect(() => resolveBunPath('/no/such/dsh-bun-binary')).toThrow(/not a spawnable file/)
  })

  it('finds bun on PATH and fails loud when PATH has none', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-bun-path-'))
    const bun = join(dir, process.platform === 'win32' ? 'bun.exe' : 'bun')
    writeFileSync(bun, '')
    chmodSync(bun, 0o755)
    expect(findBunOnPath({ PATH: dir })).toBe(bun)
    expect(resolveBunPath(undefined, { PATH: dir })).toBe(bun)
    expect(findBunOnPath({ PATH: '' })).toBeUndefined()
    expect(findBunOnPath({})).toBeUndefined()
    expect(() => resolveBunPath(undefined, { PATH: '' })).toThrow(/not found on PATH/)
  })

  it('accepts a symlink, skips empty PATH entries, and searches bun.exe on win32', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-bun-path-win-'))
    const link = join(dir, 'bun-link')
    symlinkSync(process.execPath, link)
    expect(resolveBunPath(link)).toBe(link)

    const win = join(dir, 'bun.exe')
    writeFileSync(win, '')
    expect(findBunOnPath({ PATH: `${delimiter}"${dir}"${delimiter}/no-such-dsh-bun-dir` }, 'win32')).toBe(win)
    expect(findBunOnPath({ PATH: '/no-such-dsh-bun-dir' }, 'win32')).toBeUndefined()
  })
})
