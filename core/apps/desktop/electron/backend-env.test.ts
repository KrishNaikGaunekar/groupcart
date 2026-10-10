import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { test } from 'vitest'

import {
  appendUniquePathEntries,
  buildDesktopBackendEnv,
  normalizeGroupCartHomeRoot,
  pathEnvKey,
  pooledProfileBackendEnv,
  POSIX_SANE_PATH_ENTRIES,
  profileBackendParentEnv
} from './backend-env'
import { applyLoginShellPath } from './shell-path'

test('backend env scrubs PYTHONPATH and PYTHONHOME', () => {
  const env = buildDesktopBackendEnv({
    currentEnv: {
      PATH: '/usr/bin:/bin',
      PYTHONPATH: '/leaked/other/checkout',
      PYTHONHOME: '/leaked/python'
    },
    platform: 'darwin'
  })

  assert.equal(env.PYTHONPATH, '')
  assert.equal(env.PYTHONHOME, '')
})

test('POSIX backend PATH keeps the inherited PATH first and appends missing sane entries', () => {
  const env = buildDesktopBackendEnv({
    currentEnv: { PATH: '/opt/homebrew/bin:/usr/bin:/bin' },
    platform: 'darwin'
  })

  const entries = env.PATH.split(':')
  assert.equal(entries[0], '/opt/homebrew/bin', 'inherited PATH keeps precedence')
  assert.equal(entries.filter(entry => entry === '/opt/homebrew/bin').length, 1, 'no duplicates')

  for (const expected of POSIX_SANE_PATH_ENTRIES) {
    assert.ok(entries.includes(expected), `${expected} should be present`)
  }
})

test('backend runs the store toolchain even after the login-shell PATH is merged in front of it', async () => {
  // `groupcart desktop` hands Electron a PATH with the PM store first; the
  // login-shell merge then puts nvm/Homebrew ahead of it in process.env.
  const env: Record<string, string> = {
    PATH: '/Users/u/.groupcart/tools/node-26.7.0-darwin-arm64/bin:/Users/u/.groupcart/tools/uv-0.12.3-darwin-arm64:/usr/bin:/bin'
  }

  const loginPath = '/Users/u/.nvm/versions/node/v20.0.0/bin:/opt/homebrew/bin:/usr/bin'

  const execFileFn = (_file, _args, _options, callback) => {
    queueMicrotask(() => callback(null, `__GROUPCART_LOGIN_PATH_START__${loginPath}__GROUPCART_LOGIN_PATH_END__`, ''))

    return { stdin: { end() {} } }
  }

  await applyLoginShellPath({ env, platform: 'darwin', execFileFn })
  assert.equal(env.PATH.split(':')[0], '/Users/u/.nvm/versions/node/v20.0.0/bin', 'user-facing env keeps login order')

  const backend = buildDesktopBackendEnv({ currentEnv: env, platform: 'darwin', homedir: '/Users/u' })

  assert.deepEqual(backend.PATH.split(':').slice(0, 5), [
    '/Users/u/.groupcart/tools/node-26.7.0-darwin-arm64/bin',
    '/Users/u/.groupcart/tools/uv-0.12.3-darwin-arm64',
    '/Users/u/.nvm/versions/node/v20.0.0/bin',
    '/opt/homebrew/bin',
    '/usr/bin'
  ])
})

test('GROUPCART_RUNTIME_DIR names the store; look-alike prefixes are not GroupCart-owned', () => {
  const store = '/Applications/GroupCart.app/Contents/Resources/agent-payload/tools'

  const backend = buildDesktopBackendEnv({
    currentEnv: {
      GROUPCART_RUNTIME_DIR: store,
      PATH: `/opt/homebrew/bin:/Users/u/.groupcart/tools-old/bin:${store}/npm-12.0.2-darwin-arm64/bin:/usr/bin`
    },
    platform: 'darwin',
    homedir: '/Users/u'
  })

  assert.deepEqual(backend.PATH.split(':').slice(0, 4), [
    `${store}/npm-12.0.2-darwin-arm64/bin`,
    '/opt/homebrew/bin',
    '/Users/u/.groupcart/tools-old/bin',
    '/usr/bin'
  ])
})

test('Windows PATH casing and delimiter are preserved without POSIX sane entries', () => {
  const env = buildDesktopBackendEnv({
    currentEnv: { Path: 'C:\\Windows\\System32;C:\\Windows' },
    platform: 'win32'
  })

  assert.equal(env.Path, 'C:\\Windows\\System32;C:\\Windows')
  assert.equal(env.PATH, undefined)
})

test('buildDesktopBackendEnv forces PYTHONUTF8 unless the user set it explicitly', () => {
  const defaulted = buildDesktopBackendEnv({
    currentEnv: { PATH: '/usr/bin' },
    platform: 'darwin'
  })

  assert.equal(defaulted.PYTHONUTF8, '1')

  const optedOut = buildDesktopBackendEnv({
    currentEnv: { PATH: '/usr/bin', PYTHONUTF8: '0' },
    platform: 'darwin'
  })

  assert.equal(optedOut.PYTHONUTF8, '0')
})

test('normalizeGroupCartHomeRoot expands a literal leading ~ against the home directory, not cwd', () => {
  assert.equal(
    normalizeGroupCartHomeRoot('~/.groupcart', { pathModule: path.posix, homedir: '/Users/test' }),
    '/Users/test/.groupcart'
  )
  assert.equal(
    normalizeGroupCartHomeRoot('~/.groupcart/profiles/oracle', { pathModule: path.posix, homedir: '/Users/test' }),
    '/Users/test/.groupcart'
  )
  assert.equal(
    normalizeGroupCartHomeRoot('~\\.groupcart', { pathModule: path.win32, homedir: 'C:\\Users\\test' }),
    'C:\\Users\\test\\.groupcart'
  )
  assert.equal(normalizeGroupCartHomeRoot('~', { pathModule: path.posix, homedir: '/Users/test' }), '/Users/test')
})

test('normalizeGroupCartHomeRoot maps profile homes back to the global GroupCart root', () => {
  assert.equal(
    normalizeGroupCartHomeRoot('/Users/test/.groupcart/profiles/oracle', { pathModule: path.posix }),
    '/Users/test/.groupcart'
  )
  assert.equal(
    normalizeGroupCartHomeRoot('C:\\Users\\test\\AppData\\Local\\groupcart\\profiles\\oracle', { pathModule: path.win32 }),
    'C:\\Users\\test\\AppData\\Local\\groupcart'
  )
  assert.equal(normalizeGroupCartHomeRoot('/Users/test/.groupcart', { pathModule: path.posix }), '/Users/test/.groupcart')
})

test('pathEnvKey finds the platform-cased PATH key', () => {
  assert.equal(pathEnvKey({ Path: 'x' }, 'win32'), 'Path')
  assert.equal(pathEnvKey({ PATH: 'x' }, 'win32'), 'PATH')
  assert.equal(pathEnvKey({}, 'win32'), 'PATH')
  assert.equal(pathEnvKey({ Path: 'x' }, 'darwin'), 'PATH')
})

test('appendUniquePathEntries flattens, dedupes, and preserves first occurrence', () => {
  assert.equal(appendUniquePathEntries(['/a:/b', ['/b', '/c'], '', null], { delimiter: ':' }), '/a:/b:/c')
})

// `groupcart desktop` loads its launch profile's .env/.op.env into os.environ and
// hands that env to Electron; these cover what a profile backend inherits (#68367).
function withGroupCartRoot(files: Record<string, string>, run: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'groupcart-profile-env-'))

  try {
    for (const [rel, contents] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
      fs.writeFileSync(path.join(root, rel), contents)
    }

    run(root)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

const ROOT_SCOPE_FILES = {
  '.env': '\uFEFFTLON_SHIP_URL=https://moon.invalid\nexport TLON_SHIP_CODE = "root-code" # moon\nPATH=/root/bin\n',
  '.op.env': 'OP_SERVICE_ACCOUNT_TOKEN=root-op\n',
  'profiles/urbot/.env': 'ANTHROPIC_API_KEY=urbot-key\n'
}

const ROOT_LAUNCHED_ENV = {
  HOME: '/Users/test',
  PATH: '/usr/bin:/bin',
  TLON_SHIP_URL: 'https://moon.invalid',
  TLON_SHIP_CODE: 'root-code',
  OP_SERVICE_ACCOUNT_TOKEN: 'root-op',
  OPENROUTER_API_KEY: 'shell-key'
}

test('a named profile backend does not inherit secrets the root .env/.op.env loaded into Desktop', () => {
  withGroupCartRoot(ROOT_SCOPE_FILES, root => {
    const env = profileBackendParentEnv({
      groupcartHome: root,
      profile: 'urbot',
      currentEnv: ROOT_LAUNCHED_ENV,
      platform: 'linux'
    })

    // Shell exports the root dotenv never declared, and OS names, still reach the child.
    assert.deepEqual(env, { HOME: '/Users/test', PATH: '/usr/bin:/bin', OPENROUTER_API_KEY: 'shell-key' })
  })
})

test('the launch profile backend inherits the Desktop env unchanged', () => {
  withGroupCartRoot(ROOT_SCOPE_FILES, root => {
    for (const profile of ['default', null, undefined]) {
      assert.deepEqual(
        profileBackendParentEnv({ groupcartHome: root, profile, currentEnv: ROOT_LAUNCHED_ENV, platform: 'linux' }),
        ROOT_LAUNCHED_ENV
      )
    }
  })
})

test('a primary backend without an explicit profile follows the sticky active_profile', () => {
  withGroupCartRoot({ ...ROOT_SCOPE_FILES, active_profile: 'urbot\n' }, root => {
    const env = profileBackendParentEnv({ groupcartHome: root, profile: null, currentEnv: ROOT_LAUNCHED_ENV })

    assert.equal(env.TLON_SHIP_CODE, undefined)
    assert.equal(env.OP_SERVICE_ACCOUNT_TOKEN, undefined)
    assert.equal(env.OPENROUTER_API_KEY, 'shell-key')
  })
})

test('Desktop launched from a named profile keeps that profile out of the default backend', () => {
  withGroupCartRoot(
    {
      '.env': 'OPENAI_API_KEY=root-key\n',
      'profiles/work/.env': 'TLON_SHIP_CODE=work-code\nOP_SERVICE_ACCOUNT_TOKEN=work-op\n'
    },
    root => {
      const currentEnv = {
        GROUPCART_HOME: path.join(root, 'profiles', 'work'),
        TLON_SHIP_CODE: 'work-code',
        OP_SERVICE_ACCOUNT_TOKEN: 'work-op',
        OPENAI_API_KEY: 'shell-key'
      }

      assert.deepEqual(profileBackendParentEnv({ groupcartHome: root, profile: 'default', currentEnv }), {
        GROUPCART_HOME: currentEnv.GROUPCART_HOME,
        OPENAI_API_KEY: 'shell-key'
      })
      assert.deepEqual(profileBackendParentEnv({ groupcartHome: root, profile: 'work', currentEnv }), currentEnv)
    }
  )
})

test('Windows matches profile homes and dotenv names case-insensitively', () => {
  const root = 'C:\\Users\\test\\AppData\\Local\\groupcart'
  const files = { [`${root}\\.env`]: 'TELEGRAM_BOT_TOKEN=root-token\r\n' }

  const fsModule = {
    readFileSync: file => {
      if (!(file in files)) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      }

      return files[file]
    }
  }

  const currentEnv = {
    GROUPCART_HOME: 'c:\\users\\test\\appdata\\local\\GROUPCART',
    Path: 'C:\\Windows',
    Telegram_Bot_Token: 'root-token'
  }

  const scoped = (profile: string) =>
    profileBackendParentEnv({ groupcartHome: root, profile, currentEnv, platform: 'win32', fsModule })

  assert.deepEqual(scoped('default'), currentEnv)
  assert.deepEqual(scoped('urbot'), { GROUPCART_HOME: currentEnv.GROUPCART_HOME, Path: 'C:\\Windows' })
})

test('a pooled profile backend drops the launch profile TERMINAL_CWD (#87584)', () => {
  withGroupCartRoot(ROOT_SCOPE_FILES, root => {
    // The Desktop env carries the app-global cwd (resolveGroupCartCwd) and the
    // runtime may add its own; both name the LAUNCH profile's workspace.
    const env = pooledProfileBackendEnv({
      groupcartHome: root,
      profile: 'urbot',
      currentEnv: { ...ROOT_LAUNCHED_ENV, TERMINAL_CWD: '/source/launch-workspace' },
      backendEnv: { TERMINAL_CWD: '/stale/runtime-workspace', KEEP_BACKEND: '1' },
      platform: 'linux'
    })

    assert.equal(env.TERMINAL_CWD, undefined)
    assert.equal(env.GROUPCART_HOME, root, 'the child resolves --profile under the Desktop-resolved root')
    assert.equal(env.KEEP_BACKEND, '1')
    // The named-profile dotenv scrub (#68367) still applies on top.
    assert.equal(env.TLON_SHIP_CODE, undefined)
    assert.equal(env.OP_SERVICE_ACCOUNT_TOKEN, undefined)
    assert.equal(env.OPENROUTER_API_KEY, 'shell-key')
  })
})

test('a pooled backend removes case-insensitive TERMINAL_CWD on Windows', () => {
  withGroupCartRoot(ROOT_SCOPE_FILES, root => {
    const env = pooledProfileBackendEnv({
      groupcartHome: root,
      profile: 'urbot',
      currentEnv: { Path: 'C:\\Windows', Terminal_Cwd: 'C:\\source\\workspace' },
      backendEnv: { terminal_cwd: 'C:\\backend' },
      platform: 'win32'
    })

    assert.equal(env.Terminal_Cwd, undefined)
    assert.equal(env.terminal_cwd, undefined)
    assert.equal(env.Path, 'C:\\Windows')
  })
})

test('the launch profile pooled backend keeps its TERMINAL_CWD', () => {
  withGroupCartRoot(ROOT_SCOPE_FILES, root => {
    // profile 'default' targets the root home: no dotenv scrub, and the pin
    // survives only when the caller (main.ts) provides it — the pooled helper
    // itself never stamps one, it only strips inherited/global values.
    const env = pooledProfileBackendEnv({
      groupcartHome: root,
      profile: 'default',
      currentEnv: { TERMINAL_CWD: '/launch-workspace', PATH: '/usr/bin' },
      platform: 'linux'
    })

    assert.equal(
      env.TERMINAL_CWD,
      undefined,
      'the pooled helper never carries the global pin; main.ts owns that decision'
    )
    assert.equal(env.PATH, '/usr/bin')
  })
})
