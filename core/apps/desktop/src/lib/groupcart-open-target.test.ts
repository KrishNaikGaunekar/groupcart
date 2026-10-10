import { describe, expect, it } from 'vitest'

import {
  normalizeGroupCartOpenString,
  pathFromGroupCartDeepLink,
  pathFromOpenDeepLink,
  resolveGroupCartOpenPath
} from './groupcart-open-target'

describe('normalizeGroupCartOpenString', () => {
  it('accepts hash-router paths and strips a leading hash', () => {
    expect(normalizeGroupCartOpenString('/index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeGroupCartOpenString('#/index-network/intent/1')).toBe('/index-network/intent/1')
  })

  it('maps plugin-scoped groupcart:// deep links to the same path', () => {
    expect(normalizeGroupCartOpenString('groupcart://index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeGroupCartOpenString('groupcart://index-network/intent/1?focus=true')).toBe(
      '/index-network/intent/1?focus=true'
    )
  })

  it('maps groupcart://open/… deep links by stripping the open host', () => {
    expect(normalizeGroupCartOpenString('groupcart://open/index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeGroupCartOpenString('groupcart://open/settings/plugins')).toBe('/settings/plugins')
  })

  it('rejects reserved groupcart kinds and unsafe paths', () => {
    expect(normalizeGroupCartOpenString('groupcart://blueprint/morning-brief')).toBeNull()
    expect(normalizeGroupCartOpenString('groupcart://plugin/install')).toBeNull()
    expect(normalizeGroupCartOpenString('https://example.com/x')).toBeNull()
    expect(normalizeGroupCartOpenString('/../etc/passwd')).toBeNull()
    expect(normalizeGroupCartOpenString('index-network')).toBeNull()
  })
})

describe('resolveGroupCartOpenPath', () => {
  it('merges structured path + params', () => {
    expect(resolveGroupCartOpenPath({ path: '/index-network/intent/1', params: { focus: 'true' } })).toBe(
      '/index-network/intent/1?focus=true'
    )
  })

  it('resolves href the same as a bare string', () => {
    expect(resolveGroupCartOpenPath({ href: 'groupcart://index-network/intent/1' })).toBe('/index-network/intent/1')
  })
})

describe('pathFromGroupCartDeepLink', () => {
  it('builds the navigate path from a plugin-scoped deep-link payload', () => {
    expect(pathFromGroupCartDeepLink('index-network', 'intent/1')).toBe('/index-network/intent/1')
  })

  it('builds the navigate path from groupcart://open/… payloads', () => {
    expect(pathFromOpenDeepLink('index-network/intent/1')).toBe('/index-network/intent/1')
    expect(pathFromGroupCartDeepLink('open', 'agent/42')).toBe('/agent/42')
  })

  it('ignores reserved kinds', () => {
    expect(pathFromGroupCartDeepLink('blueprint', 'morning-brief')).toBeNull()
    expect(pathFromGroupCartDeepLink('plugin', 'install')).toBeNull()
  })
})
