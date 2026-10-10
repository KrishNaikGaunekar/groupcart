import assert from 'node:assert/strict'

import { test } from 'vitest'

import { hasWindowsPathPrefix, isExternalVenvHolder, isGroupCartOwnedVenvDaemon } from './venv-holder-select'

const SCRIPTS = 'C:\\GroupCart\\venv\\Scripts'

test('matches the hindsight daemon shim (exe under venv Scripts + hindsight cmdline)', () => {
  assert.equal(
    isGroupCartOwnedVenvDaemon(
      'C:\\GroupCart\\venv\\Scripts\\pythonw.exe',
      'C:\\GroupCart\\venv\\Scripts\\pythonw.exe -m hindsight_api.main --daemon --idle-timeout 300 --port 9177',
      SCRIPTS
    ),
    true
  )
})

test('Windows path prefix match is ordinal case-insensitive', () => {
  assert.equal(
    isGroupCartOwnedVenvDaemon(
      'c:\\groupcart\\venv\\scripts\\python.exe',
      'python.exe -m hindsight_api.main --daemon',
      'C:\\GroupCart\\venv\\Scripts'
    ),
    true
  )
})

test('excludes external venv holders that are not the hindsight daemon', () => {
  // a user terminal running the groupcart CLI from the venv — must NOT be killed
  assert.equal(isGroupCartOwnedVenvDaemon('C:\\GroupCart\\venv\\Scripts\\groupcart.exe', 'groupcart chat -q "hi"', SCRIPTS), false)
  // an unrelated python script using the venv interpreter
  assert.equal(
    isGroupCartOwnedVenvDaemon('C:\\GroupCart\\venv\\Scripts\\python.exe', 'python C:\\tools\\import.py', SCRIPTS),
    false
  )
})

test('excludes exes outside the venv even when the cmdline mentions hindsight', () => {
  assert.equal(
    isGroupCartOwnedVenvDaemon('C:\\Other\\pythonw.exe', 'pythonw -m hindsight_api.main --daemon', SCRIPTS),
    false
  )
})

test('prefix boundary: sibling dirs (ScriptsX) do not match', () => {
  assert.equal(hasWindowsPathPrefix('C:\\GroupCart\\venv\\ScriptsX\\python.exe', SCRIPTS), false)
  assert.equal(hasWindowsPathPrefix('C:\\GroupCart\\venv\\Scripts\\python.exe', SCRIPTS), true)
})

test('null/undefined fields never match', () => {
  assert.equal(isGroupCartOwnedVenvDaemon(null, 'x', SCRIPTS), false)
  assert.equal(isGroupCartOwnedVenvDaemon('C:\\GroupCart\\venv\\Scripts\\pythonw.exe', null, SCRIPTS), false)
  assert.equal(isGroupCartOwnedVenvDaemon(undefined, undefined, SCRIPTS), false)
})

// --- isExternalVenvHolder (#62311) ------------------------------------------

test('matches the autostart gateway shim (groupcart.exe under venv Scripts)', () => {
  assert.equal(
    isExternalVenvHolder(
      'C:\\GroupCart\\venv\\Scripts\\groupcart.exe',
      '"C:\\GroupCart\\venv\\Scripts\\groupcart.exe" gateway run --external-supervisor',
      SCRIPTS
    ),
    true
  )
})

test('matches the dashboard scheduled task (python -m groupcart_cli / -m groupcart)', () => {
  assert.equal(
    isExternalVenvHolder(
      'C:\\GroupCart\\venv\\Scripts\\python.exe',
      '"C:\\GroupCart\\venv\\Scripts\\python.exe" -m groupcart_cli.main dashboard',
      SCRIPTS
    ),
    true
  )
  assert.equal(
    isExternalVenvHolder('C:\\GroupCart\\venv\\Scripts\\pythonw.exe', 'pythonw.exe -m groupcart serve', SCRIPTS),
    true
  )
})

test('never matches an unrelated process that merely borrows the venv interpreter', () => {
  // a user's own script running on the venv python — NOT GroupCart, must NOT be killed
  assert.equal(
    isExternalVenvHolder('C:\\GroupCart\\venv\\Scripts\\python.exe', 'python C:\\tools\\import.py', SCRIPTS),
    false
  )
  // hindsight daemon is selected by isGroupCartOwnedVenvDaemon, not here
  assert.equal(
    isExternalVenvHolder('C:\\GroupCart\\venv\\Scripts\\pythonw.exe', 'pythonw -m hindsight_api.main --daemon', SCRIPTS),
    false
  )
})

test('never matches a process outside the venv, even with groupcart in the cmdline', () => {
  // an editor / shell whose command line mentions the install root (#62445 regression guard)
  assert.equal(
    isExternalVenvHolder('C:\\Windows\\System32\\cmd.exe', 'cmd /c cd C:\\GroupCart\\venv\\Scripts && dir', SCRIPTS),
    false
  )
  assert.equal(isExternalVenvHolder('C:\\Other\\groupcart.exe', 'groupcart gateway run', SCRIPTS), false)
})

test('sibling-dir and boundary safety for the external selector', () => {
  assert.equal(isExternalVenvHolder('C:\\GroupCart\\venv\\ScriptsX\\groupcart.exe', 'groupcart gateway run', SCRIPTS), false)
  assert.equal(isExternalVenvHolder(null, 'groupcart gateway run', SCRIPTS), false)
  assert.equal(isExternalVenvHolder('C:\\GroupCart\\venv\\Scripts\\groupcart.exe', null, SCRIPTS), false)
})
