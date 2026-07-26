'use strict'

const { app, BrowserWindow, session } = require('electron')
const { spawn } = require('child_process')
const http = require('http')
const path = require('path')

const PORT = 3456
let serverProc = null
let serverFailure = null
let mainWindow = null
/** False when we adopted a backend someone else started — never kill that one. */
let ownsServer = false

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
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: appRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      OFS_CONFIG_DIR: app.getPath('userData'),
    },
  })

  let stderr = ''
  serverProc.stdout.on('data', (chunk) => {
    process.stdout.write(chunk)
  })
  serverProc.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    stderr += text
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

/** Single quick probe: is something already serving on PORT? */
function probeServer(timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/`, (res) => {
      res.destroy()
      resolve(true)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false) })
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
  if (!serverProc || !ownsServer) return
  const proc = serverProc
  serverProc = null
  try {
    proc.kill('SIGTERM')
  } catch { /* already gone */ }
  // SIGTERM is enough for a plain HTTP server, but never leave the port held:
  // escalate if the child is still around a moment later.
  setTimeout(() => {
    if (proc.exitCode === null && proc.signalCode === null) {
      try { proc.kill('SIGKILL') } catch { /* already gone */ }
    }
  }, 1500)
}

function waitForServer(maxMs = 30000) {
  const start = Date.now()
  return new Promise((resolve) => {
    function attempt() {
      if (serverFailure) { resolve(false); return }
      if (Date.now() - start > maxMs) { resolve(false); return }
      // 127.0.0.1, not localhost: the server binds IPv4 loopback only, and
      // Node may resolve localhost to ::1 first.
      const req = http.get(`http://127.0.0.1:${PORT}/`, (res) => {
        res.destroy()
        resolve(true)
      })
      req.on('error', () => setTimeout(attempt, 500))
      req.setTimeout(400, () => { req.destroy(); setTimeout(attempt, 500) })
    }
    attempt()
  })
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
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    title: 'OpenFOAM Studio',
    show: false,
  })

  if (app.dock?.show) app.dock.show()

  mainWindow.setMenuBarVisibility(false)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
    app.focus({ steal: true })
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
  if (await probeServer()) {
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

app.on('before-quit', stopServer)
app.on('will-quit', stopServer)
process.on('exit', stopServer)

app.on('window-all-closed', () => {
  stopServer()
  app.quit()
})
