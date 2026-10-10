import { describe, expect, it, vi } from 'vitest'

import { createInstalledRuntimeGate } from './backend-resolution'

const ROOT = '/home/u/.groupcart/groupcart-agent'
const active = { label: 'active runtime' }

function gate(env: NodeJS.ProcessEnv) {
  const log = vi.fn()

  return { log, runtime: createInstalledRuntimeGate(env, log) }
}

describe('installed runtime gate', () => {
  it('uses the installed runtime without the flag', async () => {
    const { runtime } = gate({})
    const probe = vi.fn(async () => active)

    await expect(runtime.resolve(ROOT, probe)).resolves.toBe(active)
    expect(probe).toHaveBeenCalledOnce()
  })

  it('skips the installed runtime without probing it when GROUPCART_DESKTOP_IGNORE_EXISTING=1', async () => {
    const { log, runtime } = gate({ GROUPCART_DESKTOP_IGNORE_EXISTING: '1' })
    const probe = vi.fn(async () => active)

    await expect(runtime.resolve(ROOT, probe)).resolves.toBeNull()
    expect(probe).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(expect.stringContaining(ROOT))
  })

  it('honours only the value the CLI exports', async () => {
    for (const value of ['0', 'true', '']) {
      const { runtime } = gate({ GROUPCART_DESKTOP_IGNORE_EXISTING: value })

      await expect(runtime.resolve(ROOT, async () => active)).resolves.toBe(active)
    }
  })

  it('uses the runtime this launch installed so the post-install re-resolve does not reinstall', async () => {
    const { runtime } = gate({ GROUPCART_DESKTOP_IGNORE_EXISTING: '1' })
    const probe = vi.fn(async () => active)
    // main.ts: resolveGroupCartBackend's ACTIVE_GROUPCART_ROOT rung, else bootstrap-needed.
    const resolveGroupCartBackend = async () => (await runtime.resolve(ROOT, probe)) ?? 'bootstrap-needed'

    await expect(resolveGroupCartBackend()).resolves.toBe('bootstrap-needed')
    expect(probe).not.toHaveBeenCalled()
    // main.ts ensureRuntime: the re-resolve after a successful bootstrap.
    await expect(runtime.afterInstall(resolveGroupCartBackend)).resolves.toBe(active)
    // Later resolves (pool backends, TUI resume) keep the new runtime too.
    await expect(resolveGroupCartBackend()).resolves.toBe(active)
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('reads the flag at resolve time', async () => {
    const env: NodeJS.ProcessEnv = {}
    const { runtime } = gate(env)

    env.GROUPCART_DESKTOP_IGNORE_EXISTING = '1'
    await expect(runtime.resolve(ROOT, async () => active)).resolves.toBeNull()
  })
})
