'use strict'

const { app, BrowserWindow, session, safeStorage, shell } = require('electron')
const { spawn } = require('child_process')
const http = require('http')
const path = require('path')
const fs = require('fs')
const { randomBytes, randomUUID } = require('crypto')
const VERSION = require('../package.json').version
const SERVER_TOKEN = randomBytes(32).toString('hex')

const PORT = 3456
let serverProc = null
let serverFailure = null
let mainWindow = null
/** False when we adopted a backend someone else started — never kill that one. */
let ownsServer = false

// Match the standalone server's explicit data-directory override. This also
// allows packaged smoke tests to use disposable data without opening real cases.
if (process.env.OFS_CONFIG_DIR) {
  if (!path.isAbsolute(process.env.OFS_CONFIG_DIR)) throw new Error('OFS_CONFIG_DIR must be an absolute path')
  fs.mkdirSync(process.env.OFS_CONFIG_DIR, { recursive: true, mode: 0o700 })
  app.setPath('userData', process.env.OFS_CONFIG_DIR)
}

// NOTE: do NOT call app.disableHardwareAcceleration() here. It forces Chromium
// onto SwiftShader (software GL), which makes the vtk.js Geometry/Results
// viewers render an entirely black canvas in Electron. Hardware-accelerated
// WebGL is required for both 3D viewers. Override per-machine with the env var
// OFS_DISABLE_GPU=1 if a specific GPU/driver proves unstable.
if (process.env.OFS_DISABLE_GPU === '1') {
  app.disableHardwareAcceleration()
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function startupPage(title, message, details = '') {
  const safeTitle = escapeHtml(title)
  const safeMessage = escapeHtml(message)
  const safeDetails = details ? `<pre>${escapeHtml(details)}</pre>` : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 32px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: linear-gradient(180deg, #171717 0%, #101010 100%);
      color: #f5f5f5;
    }
    main {
      width: min(720px, 100%);
      padding: 28px;
      border: 1px solid #2f2f2f;
      border-radius: 16px;
      background: rgba(28, 28, 28, 0.95);
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35);
    }
    h1 {
      margin: 0 0 12px;
      font-size: 28px;
    }
    p {
      margin: 0;
      color: #d4d4d4;
      line-height: 1.55;
    }
    .spinner {
      width: 18px;
      height: 18px;
      margin-right: 10px;
      border: 2px solid #3b3b3b;
      border-top-color: #4ea1ff;
      border-radius: 50%;
      display: inline-block;
      vertical-align: -3px;
      animation: spin 0.8s linear infinite;
    }
    pre {
      margin: 18px 0 0;
      padding: 14px;
      overflow: auto;
      white-space: pre-wrap;
      border-radius: 12px;
      background: #111;
      color: #f48771;
      border: 1px solid #2f2f2f;
      font-size: 13px;
      line-height: 1.5;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <main>
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
    ${safeDetails}
  </main>
</body>
</html>`
}

function showLoadingWindow(win) {
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
    startupPage(
      'OpenFOAM Studio',
      'Starting the local app backend. This window will switch to the workspace as soon as it is ready.'
    )
  )}`)
}

function showStartupError(win, details) {
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
    startupPage(
      'Startup Error',
      'The packaged app could not start its local backend, so the main screen never became available.',
      details
    )
  )}`)
}

function startServer() {
  // In the packaged app, server.ts has been pre-compiled to server.compiled.js so
  // we run it directly with Node — no tsx/esbuild needed (and no platform-specific
  // native binaries).  In dev, fall back to tsx for hot-reloadable TypeScript.
  const appRoot = path.join(__dirname, '..')

  let spawnArgs
  if (app.isPackaged) {
    const serverFile = path.join(__dirname, 'server.compiled.js')
    spawnArgs = [serverFile]
  } else {
    const tsxCli    = path.join(appRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
    const serverFile = path.join(__dirname, 'server.ts')
    spawnArgs = [tsxCli, serverFile]
  }

  if (!serverProc || serverProc.exitCode !== null) {
    serverFailure = null
  }

  ownsServer = true
  serverProc = spawn(process.execPath, spawnArgs, {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    cwd: appRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      OFS_CONFIG_DIR: app.getPath('userData'),
      OFS_SERVER_TOKEN: SERVER_TOKEN,
      OFS_CREDENTIAL_IPC: '1',
    },
  })

  serverProc.on('message', message => {
    if (!message || message.type !== 'ofs-credentials' || typeof message.id !== 'string') return
    const reply = { type: 'ofs-credentials-reply', id: message.id }
    try {
      if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') throw new Error('OS credential encryption is unavailable. Unlock the system keychain and relaunch.')
      const file = path.join(app.getPath('userData'), 'credentials.enc')
      if (message.action === 'load') {
        reply.keys = fs.existsSync(file) ? JSON.parse(safeStorage.decryptString(fs.readFileSync(file))) : {}
      } else if (message.action === 'save') {
        if (!message.keys || typeof message.keys !== 'object') throw new Error('Invalid credential payload')
        for (const [provider, key] of Object.entries(message.keys)) {
          if (!['anthropic', 'openai', 'google', 'openai-compatible'].includes(provider) || typeof key !== 'string') throw new Error('Invalid credential payload')
        }
        fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
        const temporary = path.join(path.dirname(file), `.credentials-${randomUUID()}.tmp`)
        const fd = fs.openSync(temporary, 'wx', 0o600)
        try { fs.writeFileSync(fd, safeStorage.encryptString(JSON.stringify(message.keys))); fs.fsyncSync(fd) }
        finally { fs.closeSync(fd) }
        try { fs.renameSync(temporary, file) }
        finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary) }
      } else throw new Error('Unknown credential operation')
    } catch (err) { reply.error = err.message }
    serverProc?.send(reply)
  })
  let stderr = ''
  serverProc.stdout.on('data', (chunk) => {
    process.stdout.write(chunk)
  })
  serverProc.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    stderr = (stderr + text).slice(-64_000)
    process.stderr.write(chunk)
  })
  serverProc.on('error', (err) => {
    serverFailure = `Failed to start server process.\n${err.message}`
    console.error('[electron] Failed to start server:', err.message)
  })
  serverProc.on('exit', (code, signal) => {
    if (code === 0 && !signal) return
    serverFailure = stderr.trim() || `Server exited before the window loaded (code: ${code ?? 'unknown'}, signal: ${signal ?? 'none'}).`
    console.error('[electron] Server exited early:', serverFailure)
  })
}

/** A TCP response alone does not prove this is our compatible application. */
function probeServer(timeoutMs = 1000) {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${PORT}/api/identity`, res => {
      let body = ''
      res.on('data', chunk => { body += chunk.toString(); if (body.length > 4096) req.destroy() })
      res.on('end', () => {
        try {
          const identity = JSON.parse(body)
          resolve(res.statusCode === 200 && identity.application === 'openfoam-studio' && identity.version === VERSION && identity.protocol === 1 ? 'compatible' : 'occupied')
        } catch { resolve('occupied') }
      })
      res.on('error', () => resolve('occupied'))
    })
    req.on('error', err => resolve(err.code === 'ECONNREFUSED' ? 'absent' : 'occupied'))
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve('occupied') })
  })
}

/**
 * Kill the backend we spawned.
 *
 * Electron does NOT emit 'window-all-closed' when the app quits via app.quit()
 * (Cmd-Q, Quit menu, `osascript -e 'quit app ...'`), so hooking only that event
 * left the server child alive holding port 3456 — the next launch then hit
 * EADDRINUSE and showed the startup-error screen. Hook quit directly, and make
 * it idempotent since before-quit/will-quit/window-all-closed can all fire.
 */
function stopServer() {
  if (!serverProc || !ownsServer) return Promise.resolve()
  const proc = serverProc
  serverProc = null
  return new Promise(resolve => {
    if (proc.exitCode !== null || proc.signalCode !== null) { resolve(); return }
    const timeout = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch { /* already gone */ }
      resolve()
    }, 5_000)
    proc.once('exit', () => { clearTimeout(timeout); resolve() })
    try { proc.kill('SIGTERM') } catch { clearTimeout(timeout); resolve() }
  })
}

async function waitForServer(maxMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < maxMs && !serverFailure) {
    if (await probeServer(500) === 'compatible') return true
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  return false
}

function focusMainWindow() {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  app.focus({ steal: true })
}

app.on('second-instance', () => {
  focusMainWindow()
})

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    title: 'OpenFOAM Studio',
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  })

  if (app.dock?.show) app.dock.show()

  mainWindow.setMenuBarVisibility(false)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
    app.focus({ steal: true })
  })
  const allowedOrigins = new Set([`http://127.0.0.1:${PORT}`, ...(process.env.OFS_DEV === '1' ? ['http://localhost:5173'] : [])])
  const isAppURL = value => { try { return allowedOrigins.has(new URL(value).origin) } catch { return false } }
  mainWindow.webContents.on('will-navigate', (event, url) => { if (!isAppURL(url)) event.preventDefault() })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try { if (['https:', 'http:'].includes(new URL(url).protocol)) void shell.openExternal(url) } catch { /* ignore malformed URLs */ }
    return { action: 'deny' }
  })
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [`http://127.0.0.1:${PORT}/*`] }, (details, callback) => {
    if (ownsServer) details.requestHeaders['X-OFS-Token'] = SERVER_TOKEN
    callback({ requestHeaders: details.requestHeaders })
  })
  showLoadingWindow(mainWindow)
  mainWindow.webContents.on('did-fail-load', (_event, code, description, validatedURL) => {
    console.error('[electron] Window failed to load:', code, description, validatedURL)
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[electron] Renderer process gone:', details)
  })
  mainWindow.on('unresponsive', () => {
    console.error('[electron] Window became unresponsive')
  })
  mainWindow.on('closed', () => {
    console.error('[electron] Main window closed')
    mainWindow = null
  })

  // Purge Electron's HTTP cache so rebuilt assets are never served stale.
  await session.defaultSession.clearCache()

  // A backend may already be listening — an orphan from a previous run, or the
  // dev server. Adopt it instead of spawning a rival that dies on EADDRINUSE.
  const existing = await probeServer()
  if (existing === 'occupied' || (existing === 'compatible' && app.isPackaged)) {
    showStartupError(mainWindow, 'Port 3456 is occupied. Close the existing local server or app, then reopen OpenFOAM Studio. The packaged app requires its own authenticated backend.')
    return
  }
  if (existing === 'compatible') {
    console.log(`[electron] Reusing backend already listening on ${PORT}`)
    ownsServer = false
  } else {
    startServer()
  }

  const ready = await waitForServer()
  if (!ready) {
    const details = serverFailure ?? 'The backend did not respond on http://localhost:3456 within 30 seconds.'
    console.error('[electron] Server did not start within 30s')
    showStartupError(mainWindow, details)
    focusMainWindow()
    return
  }

  await mainWindow.loadURL(`http://127.0.0.1:${PORT}`)
})

app.on('activate', () => {
  focusMainWindow()
})

let shutdownComplete = false
let shutdownPending = false
app.on('before-quit', event => {
  if (shutdownPending) { event.preventDefault(); return }
  if (shutdownComplete || !ownsServer || !serverProc) return
  event.preventDefault()
  shutdownPending = true
  void stopServer().finally(() => { shutdownPending = false; shutdownComplete = true; app.quit() })
})
process.on('exit', () => { if (serverProc && ownsServer) { try { serverProc.kill('SIGKILL') } catch { /* already gone */ } } })

app.on('window-all-closed', () => { app.quit() })
