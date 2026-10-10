import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'

import type { DesktopProfileRoute } from './desktop-profile'
import type { HudModifierApi, HudModifierStatus } from './hud-modifier-types'
import { customWindowControlsEnabled } from './window-controls'

// Which translucency the OS can back. Asked synchronously because the renderer
// needs it before its first paint, and answered by main because deciding it
// needs `os.release()` — a sandboxed preload may only require electron, events,
// timers and url, so importing node:os here throws before contextBridge runs
// and takes the ENTIRE bridge down with it (window.groupcartDesktop undefined =>
// "Desktop IPC bridge is unavailable"). No reply means no glass, which degrades
// to an ordinary opaque window rather than a page thinned over nothing.
const translucencySupport = ipcRenderer.sendSync('groupcart:translucency:support')
const hudWindowing = ipcRenderer.sendSync('groupcart:hud:windowing')
const hudNativeDrag = hudWindowing?.nativeDrag === true

const launchFlags: { localModels?: boolean; guestOnboarding?: boolean } | undefined =
  ipcRenderer.sendSync('groupcart:feature-flags')

// Local, sanitized skin payload for the first renderer theme paint. This does
// not wait on `gateway.ready`, so an unreachable remote primary cannot force
// the built-in palette over the skin configured on this machine.
const localSkin = ipcRenderer.sendSync('groupcart:skin:local')

import { unwrapExpectedNotFound } from './api-expected-404'

contextBridge.exposeInMainWorld('groupcartDesktop', {
  glassSupported: translucencySupport?.glass === true,
  translucencySupported: translucencySupport?.translucency === true,
  // Launch-flag fact: the app was started with --local, so the renderer may
  // show the local-models surfaces. Static for the window's lifetime.
  localModelsEnabled: launchFlags?.localModels === true,
  // Launch-flag fact: the Nous free tier is on for this launch
  // (GROUPCART_GUEST_ONBOARDING=1 or --guest-onboarding). Read-only; the same
  // decision is stamped onto every backend the app spawns.
  guestOnboardingEnabled: launchFlags?.guestOnboarding === true,
  localSkin: localSkin && typeof localSkin === 'object' ? localSkin : null,
  getConnection: (profile, opts) => ipcRenderer.invoke('groupcart:connection', profile, opts),
  // Loopback origin that hosts YouTube's player for the file:// renderer.
  getEmbedHostOrigin: () => ipcRenderer.invoke('groupcart:embed-host:origin'),
  // Registry-scoped backend resolution: { connectionId, profile } → descriptor.
  getConnectionFor: payload => ipcRenderer.invoke('groupcart:connection:for', payload),
  getProfileRoutes: profiles => ipcRenderer.invoke('groupcart:plugin-profile-routes', profiles),
  revalidateConnection: () => ipcRenderer.invoke('groupcart:connection:revalidate'),
  touchBackend: (profile, options) => ipcRenderer.invoke('groupcart:backend:touch', profile, options),
  getPoolLimits: () => ipcRenderer.invoke('groupcart:pool-limits:get'),
  setPoolLimits: limits => ipcRenderer.invoke('groupcart:pool-limits:set', limits),
  getGatewayWsUrl: profile => ipcRenderer.invoke('groupcart:gateway:ws-url', profile),
  // Registry-scoped fresh WS URL: { connectionId, profile } → result shape of
  // getGatewayWsUrl, minted against that connection's backend.
  getGatewayWsUrlFor: payload => ipcRenderer.invoke('groupcart:gateway:ws-url-for', payload),
  // Union agent roster across every registered connection.
  getAgentRoster: () => ipcRenderer.invoke('groupcart:agents:roster'),
  openSessionWindow: (sessionId, opts) => ipcRenderer.invoke('groupcart:window:openSession', sessionId, opts),
  openSessionInTerminal: (sessionId, opts) => ipcRenderer.invoke('groupcart:window:openInTerminal', sessionId, opts),
  openWindow: (options?: DesktopProfileRoute) => ipcRenderer.invoke('groupcart:window:openInstance', options),
  openBrowserWindow: tabId => ipcRenderer.invoke('groupcart:window:openBrowser', tabId),
  windowRelay: {
    send: payload => ipcRenderer.send('groupcart:window:relay', payload),
    onMessage: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('groupcart:window:relay', listener)

      return () => ipcRenderer.removeListener('groupcart:window:relay', listener)
    }
  },
  onBrowserPopoutClosed: callback => {
    const listener = (_event, tabId) => callback(tabId)
    ipcRenderer.on('groupcart:browser-popout:closed', listener)

    return () => ipcRenderer.removeListener('groupcart:browser-popout:closed', listener)
  },
  claimAmbientCue: key => ipcRenderer.invoke('groupcart:ambient:claim', key),
  windowControls: {
    custom: customWindowControlsEnabled(),
    minimize: () => ipcRenderer.send('groupcart:window-control', 'minimize'),
    toggleMaximize: () => ipcRenderer.send('groupcart:window-control', 'toggle-maximize'),
    close: () => ipcRenderer.send('groupcart:window-control', 'close')
  },
  wakeIndicator: {
    getState: () => ipcRenderer.invoke('groupcart:wake-indicator:get'),
    setState: state => ipcRenderer.send('groupcart:wake-indicator:set', state),
    onState: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('groupcart:wake-indicator:state', listener)

      return () => ipcRenderer.removeListener('groupcart:wake-indicator:state', listener)
    }
  },
  chatOnboarding: {
    size: mode => ipcRenderer.send('groupcart:window:size', mode)
  },
  petOverlay: {
    // Main renderer → main process: window lifecycle + drag. `request` is
    // `{ bounds, screen }`; resolves with the screen bounds it actually used.
    open: request => ipcRenderer.invoke('groupcart:pet-overlay:open', request),
    close: () => ipcRenderer.invoke('groupcart:pet-overlay:close'),
    setBounds: bounds => ipcRenderer.send('groupcart:pet-overlay:set-bounds', bounds),
    setIgnoreMouse: ignore => ipcRenderer.send('groupcart:pet-overlay:ignore-mouse', ignore),
    // Flip the overlay focusable (and focus it) while the composer needs keys.
    setFocusable: focusable => ipcRenderer.send('groupcart:pet-overlay:set-focusable', focusable),
    // Main renderer → overlay (forwarded by main): push the latest pet state.
    pushState: payload => ipcRenderer.send('groupcart:pet-overlay:state', payload),
    // Overlay → main renderer (forwarded by main): pop back in / composer submit.
    control: payload => ipcRenderer.send('groupcart:pet-overlay:control', payload),
    // Overlay subscribes to state pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('groupcart:pet-overlay:state', listener)

      return () => ipcRenderer.removeListener('groupcart:pet-overlay:state', listener)
    },
    // Main renderer subscribes to overlay control messages.
    onControl: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('groupcart:pet-overlay:control', listener)

      return () => ipcRenderer.removeListener('groupcart:pet-overlay:control', listener)
    }
  },
  // HUD mode: the chrome-free floating chat. A full app renderer (own gateway)
  // sized as a floating bar, so it mounts the real composer. Main owns the
  // window; `onChanged` keeps every window's toggle truthful.
  hud: {
    nativeDrag: hudNativeDrag,
    windowing: {
      clientPlacement: hudWindowing?.clientPlacement !== false,
      controlDrag: hudWindowing?.controlDrag === true,
      nativeDrag: hudNativeDrag,
      solid: hudWindowing?.solid === true,
      workspaceTransfer: hudWindowing?.workspaceTransfer === true
    },
    open: request => ipcRenderer.invoke('groupcart:hud:open', request),
    close: () => ipcRenderer.invoke('groupcart:hud:close'),
    setIgnoreMouse: ignore => ipcRenderer.send('groupcart:hud:ignore-mouse', ignore),
    beginMove: () => ipcRenderer.send('groupcart:hud:begin-move'),
    endMove: () => ipcRenderer.send('groupcart:hud:end-move'),
    moveBy: delta => ipcRenderer.send('groupcart:hud:move-by', delta),
    setWorkspaceTransfer: transferring => ipcRenderer.send('groupcart:hud:workspace-transfer', transferring),
    setBounds: bounds => ipcRenderer.send('groupcart:hud:set-bounds', bounds),
    resetLayout: () => ipcRenderer.invoke('groupcart:hud:reset-layout'),
    // Whether the band covers the window below the bar. Main pairs it with the
    // user's translucency setting to decide the native frost (macOS vibrancy /
    // Windows 11 DWM backdrop) — see hudFrostFor.
    setFrost: showing => ipcRenderer.invoke('groupcart:hud:frost', showing),
    // The HUD tells main which session it is on; main hands that back to the
    // app window when the HUD closes, so the app can re-home onto it.
    setSession: sessionId => ipcRenderer.send('groupcart:hud:session', sessionId),
    onGoto: callback => {
      const listener = (_event, sessionId) => callback(sessionId)
      ipcRenderer.on('groupcart:hud:goto', listener)

      return () => ipcRenderer.removeListener('groupcart:hud:goto', listener)
    },
    onChanged: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('groupcart:hud:changed', listener)

      return () => ipcRenderer.removeListener('groupcart:hud:changed', listener)
    },
    // Linux only, and silent elsewhere: where the cursor is, in page
    // coordinates, or null when it has left the window. Stands in for the
    // mousemove that `setIgnoreMouseEvents(true, { forward: true })` delivers on
    // macOS and Windows but not here.
    onCursor: callback => {
      const listener = (_event, point) => callback(point)
      ipcRenderer.on('groupcart:hud:cursor', listener)

      return () => ipcRenderer.removeListener('groupcart:hud:cursor', listener)
    },
    // Main's game-overlay watch: whether a fullscreen app (a game) is under
    // the HUD, so the renderer can step back to the low-opacity overlay
    // treatment while one owns the screen.
    onGameOverlay: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('groupcart:hud:game-overlay', listener)

      return () => ipcRenderer.removeListener('groupcart:hud:game-overlay', listener)
    }
  },
  hudModifier: {
    getSettings: () => ipcRenderer.invoke('groupcart:hud-modifier:settings:get'),
    setEnabled: enabled => ipcRenderer.invoke('groupcart:hud-modifier:settings:set', enabled),
    openPermissionSettings: () => ipcRenderer.invoke('groupcart:hud-modifier:permission'),
    onStatus: callback => {
      const listener = (_event: Electron.IpcRendererEvent, status: HudModifierStatus) => callback(status)
      ipcRenderer.on('groupcart:hud-modifier:status', listener)

      return () => ipcRenderer.removeListener('groupcart:hud-modifier:status', listener)
    }
  } satisfies HudModifierApi,
  // macOS native screenshot gesture; captures require a main-issued request.
  screenshot:
    process.platform === 'darwin'
      ? {
          getSettings: () => ipcRenderer.invoke('groupcart:screenshot:settings:get'),
          setEnabled: enabled => ipcRenderer.invoke('groupcart:screenshot:settings:set', enabled),
          openPermissionSettings: kind => ipcRenderer.invoke('groupcart:screenshot:permission', kind),
          capture: requestId => ipcRenderer.invoke('groupcart:screenshot:capture', requestId),
          onStatus: callback => {
            const listener = (_event, status) => callback(status)
            ipcRenderer.on('groupcart:screenshot:status', listener)

            return () => ipcRenderer.removeListener('groupcart:screenshot:status', listener)
          },
          onRequest: callback => {
            const channel = 'groupcart:screenshot:request'
            const listener = (_event, requestId) => callback(requestId)

            if (ipcRenderer.listenerCount(channel) === 0) {
              ipcRenderer.send('groupcart:screenshot:subscribe', true)
            }

            ipcRenderer.on(channel, listener)

            return () => {
              ipcRenderer.removeListener(channel, listener)

              if (ipcRenderer.listenerCount(channel) === 0) {
                ipcRenderer.send('groupcart:screenshot:subscribe', false)
              }
            }
          }
        }
      : undefined,
  // Quick Entry: the global-hotkey mini composer window. Main owns the OS
  // shortcut + the persisted preference; the quick window only captures text
  // and hands it back, and the primary renderer submits it through the normal
  // prompt path.
  quickEntry: {
    getSettings: () => ipcRenderer.invoke('groupcart:quick-entry:settings:get'),
    setSettings: patch => ipcRenderer.invoke('groupcart:quick-entry:settings:set', patch),
    // Invoke returns the delivery result so the draft is not lost (#85590).
    submit: payload => ipcRenderer.invoke('groupcart:quick-entry:submit', payload),
    // Main cannot invoke the primary renderer, so it receives this ack (#85590).
    ackSubmit: (correlationId, result) => ipcRenderer.send('groupcart:quick-entry:ack', { correlationId, result }),
    dismiss: () => ipcRenderer.send('groupcart:quick-entry:dismiss'),
    // Primary renderer → main → quick window: gateway connection state + the
    // recent-session options the target picker offers. Main caches the latest
    // payload so a freshly spawned quick window starts from truth.
    pushState: payload => ipcRenderer.send('groupcart:quick-entry:state', payload),
    // Quick window subscribes to those pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('groupcart:quick-entry:state', listener)

      return () => ipcRenderer.removeListener('groupcart:quick-entry:state', listener)
    },
    // Main → primary renderer: a submit captured by the quick window.
    onSubmit: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('groupcart:quick-entry:submit', listener)

      return () => ipcRenderer.removeListener('groupcart:quick-entry:submit', listener)
    },
    // Main → quick window: you were just summoned (reset draft + refocus).
    onShown: callback => {
      const listener = () => callback()
      ipcRenderer.on('groupcart:quick-entry:shown', listener)

      return () => ipcRenderer.removeListener('groupcart:quick-entry:shown', listener)
    },
    // Main → quick window: the outcome of a submit whose relay already timed
    // out. Delivery is now KNOWN — reconcile the unknown state instead of
    // leaving the user to resend a prompt that may already be delivered.
    onLateResult: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('groupcart:quick-entry:late-result', listener)

      return () => ipcRenderer.removeListener('groupcart:quick-entry:late-result', listener)
    }
  },
  getBootProgress: () => ipcRenderer.invoke('groupcart:boot-progress:get'),
  getConnectionConfig: profile => ipcRenderer.invoke('groupcart:connection-config:get', profile),
  saveConnectionConfig: payload => ipcRenderer.invoke('groupcart:connection-config:save', payload),
  applyConnectionConfig: payload => ipcRenderer.invoke('groupcart:connection-config:apply', payload),
  testConnectionConfig: payload => ipcRenderer.invoke('groupcart:connection-config:test', payload),
  // Opt-in OS-keychain encryption for stored gateway secrets (default off —
  // see secret-storage-policy.ts). get never touches the OS keychain.
  getSecretStorageEncryption: () => ipcRenderer.invoke('groupcart:secret-storage:get'),
  setSecretStorageEncryption: (on: boolean) => ipcRenderer.invoke('groupcart:secret-storage:set', on),
  // v2 multi-connection registry: named agent sources (local / remote / cloud / ssh).
  connections: {
    list: () => ipcRenderer.invoke('groupcart:connections:list'),
    save: payload => ipcRenderer.invoke('groupcart:connections:save', payload),
    remove: id => ipcRenderer.invoke('groupcart:connections:remove', id),
    setPrimary: id => ipcRenderer.invoke('groupcart:connections:set-primary', id),
    setLaunchMode: mode => ipcRenderer.invoke('groupcart:connections:set-launch-mode', mode),
    setLastUsed: id => ipcRenderer.invoke('groupcart:connections:set-last-used', id),
    test: id => ipcRenderer.invoke('groupcart:connections:test', id),
    updateManaged: id => ipcRenderer.invoke('groupcart:connections:update-managed', id),
    // Fan out `groupcart update` to every eligible registered connection.
    // Optional excludeIds skips rows the caller updates through another path.
    updateAll: options => ipcRenderer.invoke('groupcart:connections:update-all', options),
    // Registry lifecycle push (main → renderer): a connection was removed or
    // materially edited, so secondaries scoped to it must be disposed (and,
    // for edits, re-dialed at the new target).
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('groupcart:connections:changed', listener)

      return () => ipcRenderer.removeListener('groupcart:connections:changed', listener)
    }
  },
  sshConfigHosts: () => ipcRenderer.invoke('groupcart:ssh-config:hosts'),
  sshResolveHost: host => ipcRenderer.invoke('groupcart:ssh-config:resolve', host),
  probeConnectionConfig: remoteUrl => ipcRenderer.invoke('groupcart:connection-config:probe', remoteUrl),
  // `options` lets a registry-editor draft sign in BEFORE it is saved: the
  // main process settles the draft's connection id up front so the login
  // window writes into the per-connection cookie jar the saved entry will
  // read (not the legacy shared jar an unsaved URL would fall back to).
  oauthLoginConnectionConfig: (remoteUrl, options) =>
    ipcRenderer.invoke('groupcart:connection-config:oauth-login', remoteUrl, options),
  oauthLogoutConnectionConfig: remoteUrl => ipcRenderer.invoke('groupcart:connection-config:oauth-logout', remoteUrl),
  // GroupCart Cloud: one portal login powers discovery + silent per-agent sign-in
  // (cloud-auto-discovery Phase 3).
  cloud: {
    status: () => ipcRenderer.invoke('groupcart:cloud:status'),
    login: () => ipcRenderer.invoke('groupcart:cloud:login'),
    logout: () => ipcRenderer.invoke('groupcart:cloud:logout'),
    discover: org => ipcRenderer.invoke('groupcart:cloud:discover', org),
    agentSignIn: dashboardUrl => ipcRenderer.invoke('groupcart:cloud:agent-sign-in', dashboardUrl)
  },
  profile: {
    getDefault: () => ipcRenderer.invoke('groupcart:profile:default:get'),
    setDefault: (route: DesktopProfileRoute) => ipcRenderer.invoke('groupcart:profile:default:set', route),
    onDefaultChanged: (callback: (route: DesktopProfileRoute | null) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, route: DesktopProfileRoute | null) => callback(route)
      ipcRenderer.on('groupcart:profile:default:changed', listener)

      return () => ipcRenderer.removeListener('groupcart:profile:default:changed', listener)
    },
    get: () => ipcRenderer.invoke('groupcart:profile:get'),
    remember: name => ipcRenderer.invoke('groupcart:profile:remember', name),
    set: name => ipcRenderer.invoke('groupcart:profile:set', name)
  },
  // The handler resolves an expected 404 with a sentinel instead of rejecting
  // (Electron logs a stack for every rejected invoke). Turn it back into the
  // rejection the renderer expects — see electron/api-expected-404.ts.
  api: request => ipcRenderer.invoke('groupcart:api', request).then(unwrapExpectedNotFound),
  notify: payload => ipcRenderer.invoke('groupcart:notify', payload),
  claimStartupLatency: () => ipcRenderer.invoke('groupcart:startup-latency:claim'),
  requestMicrophoneAccess: () => ipcRenderer.invoke('groupcart:requestMicrophoneAccess'),
  readWindowBelow: () => ipcRenderer.invoke('groupcart:window:readBelow'),
  readFileDataUrl: filePath => ipcRenderer.invoke('groupcart:readFileDataUrl', filePath),
  readFileDataUrlForAttach: filePath => ipcRenderer.invoke('groupcart:readFileDataUrlForAttach', filePath),
  dataUrlReadMax: {
    get: () => ipcRenderer.invoke('groupcart:data-url-read-max:get'),
    set: maxMb => ipcRenderer.invoke('groupcart:data-url-read-max:set', maxMb)
  },
  readFileText: filePath => ipcRenderer.invoke('groupcart:readFileText', filePath),
  readPluginSource: (filePath: string) => ipcRenderer.invoke('groupcart:readPluginSource', filePath),
  selectPaths: options => ipcRenderer.invoke('groupcart:selectPaths', options),
  selectSavePath: options => ipcRenderer.invoke('groupcart:selectSavePath', options),
  writeClipboard: text => ipcRenderer.invoke('groupcart:writeClipboard', text),
  readClipboard: () => ipcRenderer.invoke('groupcart:readClipboard'),
  saveGatewayFile: payload => ipcRenderer.invoke('groupcart:saveGatewayFile', payload),
  saveImageFromUrl: url => ipcRenderer.invoke('groupcart:saveImageFromUrl', url),
  contextMenuEdit: command => ipcRenderer.invoke('groupcart:context-menu:edit', command),
  contextMenuCopyImage: () => ipcRenderer.invoke('groupcart:context-menu:copy-image'),
  contextMenuSpellcheck: action => ipcRenderer.invoke('groupcart:context-menu:spellcheck', action),
  contextMenuGuestAddWord: payload => ipcRenderer.invoke('groupcart:context-menu:guest-add-word', payload),
  onContextMenuSpellcheck: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('groupcart:context-menu-spellcheck', listener)

    return () => ipcRenderer.removeListener('groupcart:context-menu-spellcheck', listener)
  },
  saveImageBuffer: (data, ext, name) => ipcRenderer.invoke('groupcart:saveImageBuffer', { data, ext, name }),
  capturePreview: payload => ipcRenderer.invoke('groupcart:capturePreview', payload),
  savePastedText: text => ipcRenderer.invoke('groupcart:savePastedText', { text }),
  saveClipboardImage: () => ipcRenderer.invoke('groupcart:saveClipboardImage'),
  getPathForFile: file => {
    try {
      return webUtils.getPathForFile(file) || ''
    } catch {
      return ''
    }
  },
  normalizePreviewTarget: (target, baseDir) => ipcRenderer.invoke('groupcart:normalizePreviewTarget', target, baseDir),
  watchPreviewFile: url => ipcRenderer.invoke('groupcart:watchPreviewFile', url),
  watchDirectory: dir => ipcRenderer.invoke('groupcart:watchDirectory', dir),
  stopPreviewFileWatch: id => ipcRenderer.invoke('groupcart:stopPreviewFileWatch', id),
  setActiveWork: payload => ipcRenderer.send('groupcart:active-work', payload),
  setTitleBarTheme: payload => ipcRenderer.send('groupcart:titlebar-theme', payload),
  setNativeTheme: mode => ipcRenderer.send('groupcart:native-theme', mode),
  setTranslucency: payload => ipcRenderer.send('groupcart:translucency', payload),
  setKeepAwake: mode => ipcRenderer.send('groupcart:keep-awake', mode),
  minimizeToTray: {
    get: () => ipcRenderer.invoke('groupcart:minimize-to-tray:get'),
    set: on => ipcRenderer.invoke('groupcart:minimize-to-tray:set', on),
    onChanged: callback => {
      const listener = (_event, status) => callback(status)
      ipcRenderer.on('groupcart:minimize-to-tray:changed', listener)

      return () => ipcRenderer.removeListener('groupcart:minimize-to-tray:changed', listener)
    }
  },
  setDisableF12: blocked => ipcRenderer.send('groupcart:devtools:disable-f12', blocked),
  setF12ShortcutActive: active => ipcRenderer.send('groupcart:f12ShortcutActive', Boolean(active)),
  onF12Shortcut: callback => {
    const listener = (_event, input) => callback(input)
    ipcRenderer.on('groupcart:f12-shortcut', listener)

    return () => ipcRenderer.removeListener('groupcart:f12-shortcut', listener)
  },
  setPreviewShortcutActive: active => ipcRenderer.send('groupcart:previewShortcutActive', Boolean(active)),
  setPreviewGuestHidden: (webContentsId, hidden) =>
    ipcRenderer.send('groupcart:preview-guest-hidden', { webContentsId, hidden: Boolean(hidden) }),
  openExternal: url => ipcRenderer.invoke('groupcart:openExternal', url),
  freeTierChallenge: {
    // Load the account service's challenge page in a hidden window (revealed
    // only if the page asks for the human). Resolves with how it ended.
    run: request => ipcRenderer.invoke('groupcart:freeTierChallenge:run', request)
  },
  mcpOauth: {
    // One-shot loopback listener for MCP OAuth against remote backends: bind
    // on this machine, hand redirectUri to mcp.servers.oauth.start, then wait
    // for the provider redirect and relay code/state via oauth.callback.
    listen: () => ipcRenderer.invoke('groupcart:mcp-oauth:listen'),
    wait: (id, timeoutMs) => ipcRenderer.invoke('groupcart:mcp-oauth:wait', id, timeoutMs),
    cancel: id => ipcRenderer.invoke('groupcart:mcp-oauth:cancel', id)
  },
  openPreviewInBrowser: url => ipcRenderer.invoke('groupcart:openPreviewInBrowser', url),
  reachPreviewUrl: url => ipcRenderer.invoke('groupcart:preview:reach', url),
  setActiveConnectionRoute: route => ipcRenderer.send('groupcart:connection:active-route', route),
  fetchLinkTitle: url => ipcRenderer.invoke('groupcart:fetchLinkTitle', url),
  resolveFavicon: url => ipcRenderer.invoke('groupcart:resolveFavicon', url),
  sanitizeWorkspaceCwd: cwd => ipcRenderer.invoke('groupcart:workspace:sanitize', cwd),
  settings: {
    getDefaultProjectDir: () => ipcRenderer.invoke('groupcart:setting:defaultProjectDir:get'),
    setDefaultProjectDir: dir => ipcRenderer.invoke('groupcart:setting:defaultProjectDir:set', dir),
    pickDefaultProjectDir: () => ipcRenderer.invoke('groupcart:setting:defaultProjectDir:pick')
  },
  zoom: {
    // Current zoom of this window, as { level, percent }.
    get: () => ipcRenderer.invoke('groupcart:zoom:get'),
    // Synchronous zoom factor (1 = 100%). Coordinate math needs it in the
    // same tick as the event it converts, so no IPC round-trip here.
    factor: () => webFrame.getZoomFactor(),
    setPercent: percent => ipcRenderer.send('groupcart:zoom:set-percent', percent),
    // Fires on every zoom change, including the Ctrl/Cmd +/-/0 shortcuts,
    // so the settings UI can stay in sync with the keyboard.
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('groupcart:zoom:changed', listener)

      return () => ipcRenderer.removeListener('groupcart:zoom:changed', listener)
    }
  },
  revealLogs: () => ipcRenderer.invoke('groupcart:logs:reveal'),
  getRecentLogs: () => ipcRenderer.invoke('groupcart:logs:recent'),
  // Fire-and-forget: persists a renderer error-boundary catch (with component
  // stack) to desktop.log so crashes survive the window (#79428).
  reportRendererError: report => ipcRenderer.send('groupcart:logs:renderer-error', report),
  logLine: (line: string): void => ipcRenderer.send('groupcart:logs:renderer-line', line),
  readDir: dirPath => ipcRenderer.invoke('groupcart:fs:readDir', dirPath),
  gitRoot: startPath => ipcRenderer.invoke('groupcart:fs:gitRoot', startPath),
  revealPath: targetPath => ipcRenderer.invoke('groupcart:fs:reveal', targetPath),
  openDir: dirPath => ipcRenderer.invoke('groupcart:fs:openDir', dirPath),
  desktopPluginsRoot: () => ipcRenderer.invoke('groupcart:fs:desktopPluginsRoot'),
  reconcileDesktopPlugins: () => ipcRenderer.invoke('groupcart:fs:reconcileDesktopPlugins'),
  logsRoot: (profile?: string) => ipcRenderer.invoke('groupcart:fs:logsRoot', profile),
  renamePath: (targetPath, newName) => ipcRenderer.invoke('groupcart:fs:rename', targetPath, newName),
  writeTextFile: (filePath, content) => ipcRenderer.invoke('groupcart:fs:writeText', filePath, content),
  trashPath: targetPath => ipcRenderer.invoke('groupcart:fs:trash', targetPath),
  git: {
    worktreeList: repoPath => ipcRenderer.invoke('groupcart:git:worktreeList', repoPath),
    worktreeAdd: (repoPath, options) => ipcRenderer.invoke('groupcart:git:worktreeAdd', repoPath, options),
    worktreeRemove: (repoPath, worktreePath, options) =>
      ipcRenderer.invoke('groupcart:git:worktreeRemove', repoPath, worktreePath, options),
    branchSwitch: (repoPath, branch) => ipcRenderer.invoke('groupcart:git:branchSwitch', repoPath, branch),
    branchList: repoPath => ipcRenderer.invoke('groupcart:git:branchList', repoPath),
    baseBranchList: repoPath => ipcRenderer.invoke('groupcart:git:baseBranchList', repoPath),
    repoStatus: repoPath => ipcRenderer.invoke('groupcart:git:repoStatus', repoPath),
    fileDiff: (repoPath, filePath) => ipcRenderer.invoke('groupcart:git:fileDiff', repoPath, filePath),
    scanRepos: (roots, options) => ipcRenderer.invoke('groupcart:git:scanRepos', roots, options),
    review: {
      list: (repoPath, scope, baseRef) => ipcRenderer.invoke('groupcart:git:review:list', repoPath, scope, baseRef),
      diff: (repoPath, filePath, scope, baseRef, staged) =>
        ipcRenderer.invoke('groupcart:git:review:diff', repoPath, filePath, scope, baseRef, staged),
      stage: (repoPath, filePath) => ipcRenderer.invoke('groupcart:git:review:stage', repoPath, filePath),
      unstage: (repoPath, filePath) => ipcRenderer.invoke('groupcart:git:review:unstage', repoPath, filePath),
      revert: (repoPath, filePath) => ipcRenderer.invoke('groupcart:git:review:revert', repoPath, filePath),
      revParse: (repoPath, ref) => ipcRenderer.invoke('groupcart:git:review:revParse', repoPath, ref),
      commit: (repoPath, message, push) => ipcRenderer.invoke('groupcart:git:review:commit', repoPath, message, push),
      commitContext: repoPath => ipcRenderer.invoke('groupcart:git:review:commitContext', repoPath),
      push: repoPath => ipcRenderer.invoke('groupcart:git:review:push', repoPath),
      shipInfo: repoPath => ipcRenderer.invoke('groupcart:git:review:shipInfo', repoPath),
      prList: (repoPath, branches, numbers) =>
        ipcRenderer.invoke('groupcart:git:review:prList', repoPath, branches, numbers),
      createPr: repoPath => ipcRenderer.invoke('groupcart:git:review:createPr', repoPath)
    }
  },
  terminal: {
    attach: id => ipcRenderer.invoke('groupcart:terminal:attach', id),
    cwd: id => ipcRenderer.invoke('groupcart:terminal:cwd', id),
    dispose: id => ipcRenderer.invoke('groupcart:terminal:dispose', id),
    resize: (id, size) => ipcRenderer.invoke('groupcart:terminal:resize', id, size),
    start: options => ipcRenderer.invoke('groupcart:terminal:start', options),
    write: (id, data) => ipcRenderer.invoke('groupcart:terminal:write', id, data),
    onData: (id, callback) => {
      const channel = `groupcart:terminal:${id}:data`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    },
    onExit: (id, callback) => {
      const channel = `groupcart:terminal:${id}:exit`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    }
  },
  onClosePreviewRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('groupcart:close-preview-requested', listener)

    return () => ipcRenderer.removeListener('groupcart:close-preview-requested', listener)
  },
  onPreviewNav: callback => {
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('groupcart:preview-nav', listener)

    return () => ipcRenderer.removeListener('groupcart:preview-nav', listener)
  },
  onOpenFolderRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('groupcart:open-folder-requested', listener)

    return () => ipcRenderer.removeListener('groupcart:open-folder-requested', listener)
  },
  onOpenUpdatesRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('groupcart:open-updates', listener)

    return () => ipcRenderer.removeListener('groupcart:open-updates', listener)
  },
  onDeepLink: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('groupcart:deep-link', listener)

    return () => ipcRenderer.removeListener('groupcart:deep-link', listener)
  },
  signalDeepLinkReady: () => ipcRenderer.invoke('groupcart:deep-link-ready'),
  probePluginRepo: payload => ipcRenderer.invoke('groupcart:plugin:probe', payload),
  installDesktopPlugin: payload => ipcRenderer.invoke('groupcart:plugin:installDesktop', payload),
  removeDesktopPlugin: payload => ipcRenderer.invoke('groupcart:plugin:removeDesktop', payload),
  onWindowStateChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('groupcart:window-state-changed', listener)

    return () => ipcRenderer.removeListener('groupcart:window-state-changed', listener)
  },
  onFocusSession: callback => {
    const listener = (_event, sessionId) => callback(sessionId)
    ipcRenderer.on('groupcart:focus-session', listener)

    return () => ipcRenderer.removeListener('groupcart:focus-session', listener)
  },
  onNotificationAction: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('groupcart:notification-action', listener)

    return () => ipcRenderer.removeListener('groupcart:notification-action', listener)
  },
  onNotificationActivate: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('groupcart:notification-activate', listener)

    return () => ipcRenderer.removeListener('groupcart:notification-activate', listener)
  },
  onExternalOpenFailed: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('groupcart:external-open-failed', listener)

    return () => ipcRenderer.removeListener('groupcart:external-open-failed', listener)
  },
  onPreviewFileChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('groupcart:preview-file-changed', listener)

    return () => ipcRenderer.removeListener('groupcart:preview-file-changed', listener)
  },
  onBackendExit: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('groupcart:backend-exit', listener)

    return () => ipcRenderer.removeListener('groupcart:backend-exit', listener)
  },
  // Cooperative pool retirement (main → renderer): the pooled backend under
  // `poolKey` is being stopped for a foreground open. Park that scope; do not
  // redial into the slot it vacated.
  onPoolBackendRetiring: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('groupcart:pool:retiring', listener)

    return () => ipcRenderer.removeListener('groupcart:pool:retiring', listener)
  },
  // Soft gateway-mode apply finished tearing down the primary backend. Renderer
  // should wipe session lists + re-dial without a window reload.
  onConnectionApplied: callback => {
    const listener = () => callback()
    ipcRenderer.on('groupcart:connection:applied', listener)

    return () => ipcRenderer.removeListener('groupcart:connection:applied', listener)
  },
  onPowerResume: callback => {
    const listener = () => callback()
    ipcRenderer.on('groupcart:power-resume', listener)

    return () => ipcRenderer.removeListener('groupcart:power-resume', listener)
  },
  // AC ↔ battery transitions; renderers slow their backstop polls on battery.
  getOnBattery: () => ipcRenderer.invoke('groupcart:power-battery:get'),
  onBatteryChanged: callback => {
    const listener = (_event, onBattery) => callback(Boolean(onBattery))
    ipcRenderer.on('groupcart:power-battery', listener)

    return () => ipcRenderer.removeListener('groupcart:power-battery', listener)
  },
  onBootProgress: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('groupcart:boot-progress', listener)

    return () => ipcRenderer.removeListener('groupcart:boot-progress', listener)
  },
  // First-launch bootstrap progress -- emitted by the install.ps1 stage
  // runner in main.ts (apps/desktop/electron/bootstrap-runner.ts).
  // Renderer's install overlay subscribes to live events and queries the
  // current snapshot via getBootstrapState() to recover after a devtools
  // reload mid-bootstrap.
  getBootstrapState: () => ipcRenderer.invoke('groupcart:bootstrap:get'),
  probeLocalBackend: () => ipcRenderer.invoke('groupcart:local-backend:probe'),
  continueBootstrapLocal: () => ipcRenderer.invoke('groupcart:bootstrap:continue-local'),
  recycleBackend: profile => ipcRenderer.invoke('groupcart:backend:recycle', profile),
  resetBootstrap: () => ipcRenderer.invoke('groupcart:bootstrap:reset'),
  updateHold: {
    recheck: () => ipcRenderer.invoke('groupcart:update-hold:recheck'),
    quit: () => ipcRenderer.invoke('groupcart:update-hold:quit'),
    startAnyway: (request: { holdId: string; confirmed: true }) =>
      ipcRenderer.invoke('groupcart:update-hold:start-anyway', request)
  },
  repairBootstrap: () => ipcRenderer.invoke('groupcart:bootstrap:repair'),
  cancelBootstrap: () => ipcRenderer.invoke('groupcart:bootstrap:cancel'),
  onBootstrapEvent: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('groupcart:bootstrap:event', listener)

    return () => ipcRenderer.removeListener('groupcart:bootstrap:event', listener)
  },
  getVersion: () => ipcRenderer.invoke('groupcart:version'),
  relaunchApp: () => ipcRenderer.invoke('groupcart:app:relaunch'),
  getMachineProfile: () => ipcRenderer.invoke('groupcart:machine:profile'),
  getRemoteDisplayReason: () => ipcRenderer.invoke('groupcart:get-remote-display-reason'),
  uninstall: {
    summary: () => ipcRenderer.invoke('groupcart:uninstall:summary'),
    run: mode => ipcRenderer.invoke('groupcart:uninstall:run', { mode }),
    openAppsSettings: () => ipcRenderer.invoke('groupcart:uninstall:openAppsSettings')
  },
  updates: {
    check: opts => ipcRenderer.invoke('groupcart:updates:check', opts),
    apply: opts => ipcRenderer.invoke('groupcart:updates:apply', opts),
    setChannel: name => ipcRenderer.invoke('groupcart:updates:channel:set', name),
    onProgress: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('groupcart:updates:progress', listener)

      return () => ipcRenderer.removeListener('groupcart:updates:progress', listener)
    },
    takePendingRun: () => ipcRenderer.invoke('groupcart:updates:metric:take'),
    ackPendingRun: sent => ipcRenderer.invoke('groupcart:updates:metric:ack', sent),
    onPendingRun: callback => {
      const listener = () => callback()
      ipcRenderer.on('groupcart:updates:metric:pending', listener)

      return () => ipcRenderer.removeListener('groupcart:updates:metric:pending', listener)
    }
  },
  desktopMetrics: {
    setEnabled: (on, profile) => ipcRenderer.invoke('groupcart:desktop-metrics:set-enabled', on, profile),
    takeRendererCrashes: () => ipcRenderer.invoke('groupcart:desktop-metrics:crash:take'),
    ackRendererCrashes: sent => ipcRenderer.invoke('groupcart:desktop-metrics:crash:ack', sent)
  },
  themes: {
    fetchMarketplace: id => ipcRenderer.invoke('groupcart:vscode-theme:fetch', id),
    searchMarketplace: query => ipcRenderer.invoke('groupcart:vscode-theme:search', query)
  },
  // Find-in-page (Ctrl/Cmd+F): delegates to Electron's
  // webContents.findInPage on the IPC sender's window so a Cmd+F pressed
  // in a secondary session window searches THAT window, not the primary.
  // `onFoundInPage` returns the unsubscribe fn; the renderer wires it via
  // `initFindInPageListener` in store/find-in-page.ts and tears it down
  // when the FindBar unmounts.
  findInPage: (query, options) => ipcRenderer.invoke('groupcart:find-in-page', query, options),
  stopFindInPage: () => ipcRenderer.invoke('groupcart:stop-find-in-page'),
  onFoundInPage: callback => {
    const listener = (_event, result) => callback(result)
    ipcRenderer.on('groupcart:found-in-page', listener)

    return () => ipcRenderer.removeListener('groupcart:found-in-page', listener)
  },
  // Main-process `before-input-event` forwards Ctrl/Cmd+F here so renderer
  // can open the FindBar even when the GTK compositor has already grabbed
  // the chord at the windowing layer (#81727).
  onOpenFindBarRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('groupcart:open-find-bar', listener)

    return () => ipcRenderer.removeListener('groupcart:open-find-bar', listener)
  }
})
