const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

// 0. Detect Setup Mode (ARTECH-Printer-Setup.exe or --setup flag)
const exeName = path.basename(process.execPath).toLowerCase();
const isSetupMode = exeName.includes('printer') || exeName.includes('setup') || process.argv.includes('--setup');

// 1. Single Instance Lock - Isolated for setup mode so both can run if needed
if (isSetupMode) {
  app.setAppUserModelId('com.artech.printer-setup');
} else {
  app.setAppUserModelId('com.artech.station');
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    console.log('[ARTECH Electron] Another instance is already running. Quitting this instance.');
    app.quit();
    process.exit(0);
  }
}

// Suppress native print preview dialog and enable background kiosk printing
app.commandLine.appendSwitch('disable-print-preview');
app.commandLine.appendSwitch('kiosk-printing');

// Load custom config from station-config.json next to .exe if exists
let userConfig = {};
const exeDir = path.dirname(process.execPath);
const configPath = path.join(exeDir, 'station-config.json');
if (fs.existsSync(configPath)) {
  try {
    userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error('[ARTECH Electron] Failed to read station-config.json:', err);
  }
}

const defaultUrl = isSetupMode ? 'http://localhost:8080/printer-setup' : 'http://localhost:8080/kiosk';
const defaultFallbackUrl = isSetupMode ? 'http://localhost:5000/printer-setup' : 'http://localhost:5000/kiosk';

const CONFIG = {
  url: isSetupMode ? defaultUrl : (userConfig.url || defaultUrl),
  fallbackUrl: isSetupMode ? defaultFallbackUrl : (userConfig.fallbackUrl || defaultFallbackUrl),
  fullscreen: isSetupMode ? false : (userConfig.fullscreen !== false),
  frame: isSetupMode ? true : false,
  kiosk: isSetupMode ? false : (userConfig.kiosk !== false),
  autoHideMenuBar: true,
  printerDeviceName: userConfig.printerDeviceName || (userConfig.printConfig && userConfig.printConfig.printerDeviceName) || '',
};

const preloadPath = path.join(__dirname, 'preload.js');
let mainWindow = null;
let ipcRegistered = false;

// Taskbar visibility helper for Windows kiosk mode
function setTaskbarVisible(visible) {
  if (process.platform !== 'win32') return;
  const show = visible ? '5' : '0';
  spawn('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-WindowStyle', 'Hidden',
    '-Command',
    `if (-not ('Win.Tray' -as [type])) { Add-Type -Name Tray -Namespace Win -MemberDefinition '[DllImport("user32.dll")] public static extern IntPtr FindWindow(string c, string n); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);' }; $n=${show}; [Win.Tray]::ShowWindow([Win.Tray]::FindWindow('Shell_TrayWnd', $null), $n) | Out-Null; [Win.Tray]::ShowWindow([Win.Tray]::FindWindow('Shell_SecondaryTrayWnd', $null), $n) | Out-Null;`
  ], { windowsHide: true, stdio: 'ignore' });
}

function logToRenderer(win, message, level = 'log') {
  console[level](message);
  if (!win || win.isDestroyed()) return;
  const payload = JSON.stringify(String(message));
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
  win.webContents.executeJavaScript(`console.${method}(${payload})`).catch(() => {});
}

function printOnce(contents, options) {
  return new Promise((resolve) => {
    try {
      contents.print(options, (success, failureReason) => {
        resolve({ success: !!success, failureReason: failureReason || '' });
      });
    } catch (err) {
      resolve({ success: false, failureReason: err && err.message ? err.message : String(err) });
    }
  });
}

async function resolvePrinterName(win) {
  try {
    const printers = await win.webContents.getPrintersAsync();
    logToRenderer(win, `[ARTECH Electron] Detected printers: ${printers.map(p => `"${p.name}"${p.isDefault ? ' [DEFAULT]' : ''}`).join(', ') || '(none)'}`);

    if (CONFIG.printerDeviceName) {
      const match = printers.find(p => p.name.toLowerCase().includes(CONFIG.printerDeviceName.toLowerCase()));
      if (match) return match.name;
    }

    // Auto-detect Zebra, Brother, TSC, Epson or thermal badge printer
    const thermal = printers.find(p => {
      const n = p.name.toLowerCase();
      return n.includes('thermal') || n.includes('badge') || n.includes('zebra') || n.includes('brother') || n.includes('label') || n.includes('tsc');
    });
    if (thermal) {
      logToRenderer(win, `[ARTECH Electron] Selected badge printer: "${thermal.name}"`);
      return thermal.name;
    }

    const defaultPrinter = printers.find(p => p.isDefault);
    if (defaultPrinter) {
      logToRenderer(win, `[ARTECH Electron] Using default printer: "${defaultPrinter.name}"`);
      return defaultPrinter.name;
    }

    if (printers.length > 0) return printers[0].name;
  } catch (err) {
    logToRenderer(win, `[ARTECH Electron] Error listing printers: ${err.message}`, 'error');
  }
  return CONFIG.printerDeviceName || '';
}

function parseDimensionToMicrons(dimStr, fallbackMicrons) {
  if (!dimStr) return fallbackMicrons;
  const str = String(dimStr).trim().toLowerCase();
  const multiMatch = str.match(/^(\d+(?:\.\d+)?)\s*[:xX*]\s*(\d+(?:\.\d+)?)\s*(mm|in|cm)?$/);
  if (multiMatch) {
    const val = parseFloat(multiMatch[1]);
    const unit = multiMatch[3] || 'mm';
    if (unit === 'in') return Math.round(val * 25400);
    if (unit === 'cm') return Math.round(val * 10000);
    return Math.round(val * 1000);
  }
  if (str.endsWith('in')) {
    const val = parseFloat(str);
    return isNaN(val) ? fallbackMicrons : Math.round(val * 25400);
  }
  if (str.endsWith('mm')) {
    const val = parseFloat(str);
    return isNaN(val) ? fallbackMicrons : Math.round(val * 1000);
  }
  if (str.endsWith('cm')) {
    const val = parseFloat(str);
    return isNaN(val) ? fallbackMicrons : Math.round(val * 10000);
  }
  const val = parseFloat(str);
  return isNaN(val) ? fallbackMicrons : Math.round(val * 1000);
}

function resolvePageSize(printConfig) {
  if (!printConfig) return undefined;
  const preset = printConfig.preset;
  if (preset === 'label-4x6') {
    return { width: 101600, height: 152400 }; // Standard 4x6" photo card / label (101.6 x 152.4 mm)
  }
  if (preset === 'cr80') {
    return { width: 85600, height: 53980 }; // Standard CR80 ID Card (85.6 x 54.0 mm)
  }

  const w = printConfig.width;
  const h = printConfig.height;
  if (!w) return undefined;

  let widthMicrons = parseDimensionToMicrons(w, 101600);
  let heightMicrons = h === 'auto' ? undefined : parseDimensionToMicrons(h, 152400);

  const match = String(w).match(/^(\d+(?:\.\d+)?)\s*[:xX*]\s*(\d+(?:\.\d+)?)\s*(mm|in|cm)?$/);
  if (match) {
    const val1 = parseFloat(match[1]);
    const val2 = parseFloat(match[2]);
    const unit = match[3] || (val1 <= 12 && val2 <= 18 ? 'in' : 'mm');
    const factor = unit === 'in' ? 25400 : (unit === 'cm' ? 10000 : 1000);
    widthMicrons = Math.round(val1 * factor);
    heightMicrons = Math.round(val2 * factor);
  }

  // If dimensions roughly match 102x152mm or 4x6", align to exact 4x6" DEVMODE (101600 x 152400)
  if (
    widthMicrons >= 100000 && widthMicrons <= 104000 &&
    heightMicrons && heightMicrons >= 150000 && heightMicrons <= 154000
  ) {
    return { width: 101600, height: 152400 };
  }

  if (widthMicrons > 0 && heightMicrons && heightMicrons > 0) {
    return { width: widthMicrons, height: heightMicrons };
  }
  return undefined;
}

async function executeSilentPrint(win, customConfig) {
  if (!win || win.isDestroyed()) return { success: false, failureReason: 'No window' };
  logToRenderer(win, '[ARTECH Electron] Silent print request received');

  const pConfig = customConfig || (userConfig && userConfig.printConfig) || {};
  const targetDeviceName = (customConfig && customConfig.printerDeviceName) || CONFIG.printerDeviceName;
  const deviceName = targetDeviceName || await resolvePrinterName(win);
  logToRenderer(win, `[ARTECH Electron] Target printer: "${deviceName || 'System Default'}"`);

  const pageSize = resolvePageSize(pConfig);
  if (pageSize) {
    logToRenderer(win, `[ARTECH Electron] Using physical page size: ${pageSize.width} x ${pageSize.height} microns`);
  }

  const isColor = pConfig.colorMode !== 'monochrome';
  const options = {
    silent: true,
    printBackground: true,
    color: isColor,
    deviceName: deviceName || undefined,
    margins: { marginType: 'none' },
    pageSize: pageSize || undefined,
  };

  const result = await printOnce(win.webContents, options);
  if (!result.success) {
    logToRenderer(win, `[ARTECH Electron] Silent print failed: ${result.failureReason}`, 'error');
  } else {
    logToRenderer(win, '[ARTECH Electron] Silent print job dispatched successfully!');
  }
  return result;
}

function registerIpc() {
  if (ipcRegistered) return;
  ipcRegistered = true;
  ipcMain.on('silent-print', (event, customConfig) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    executeSilentPrint(win, customConfig).catch((err) => {
      logToRenderer(win, `[ARTECH Electron] Print crash: ${err?.message || err}`, 'error');
    });
  });

  // 1. Get Windows detected printers
  ipcMain.handle('get-printers', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    if (!win) return [];
    try {
      const printers = await win.webContents.getPrintersAsync();
      return printers;
    } catch (err) {
      console.error('[ARTECH Electron] Error listing printers:', err);
      return [];
    }
  });

  // 2. Get current station-config.json
  ipcMain.handle('get-station-config', async () => {
    try {
      if (fs.existsSync(configPath)) {
        const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return parsed;
      }
    } catch (err) {
      console.error('[ARTECH Electron] Error reading station-config.json:', err);
    }
    return userConfig;
  });

  // 3. Save updated station-config.json
  ipcMain.handle('save-station-config', async (_event, newConfig) => {
    try {
      let existing = {};
      if (fs.existsSync(configPath)) {
        try {
          existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch {}
      }
      const merged = {
        ...existing,
        ...newConfig,
      };
      if (newConfig.printConfig?.printerDeviceName !== undefined) {
        merged.printerDeviceName = newConfig.printConfig.printerDeviceName;
      }
      fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf8');
      userConfig = merged;
      CONFIG.printerDeviceName = merged.printerDeviceName || '';
      console.log('[ARTECH Electron] Saved station-config.json successfully.');
      return { success: true, config: merged };
    } catch (err) {
      console.error('[ARTECH Electron] Error saving station-config.json:', err);
      return { success: false, error: err.message || String(err) };
    }
  });

  // 4. Test print handler
  ipcMain.handle('test-print', async (event, customConfig) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    if (!win) return { success: false, failureReason: 'No active window' };
    return executeSilentPrint(win, customConfig);
  });
}

function checkUrlAvailable(targetUrl) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(targetUrl);
      const req = http.request({
        host: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname || '/',
        method: 'GET',
        timeout: 1000,
      }, (res) => {
        resolve(res.statusCode < 500);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    } catch {
      resolve(false);
    }
  });
}

function loadEnv() {
  const candidates = [
    path.join(exeDir, '.env'),
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', '.env'),
    path.resolve(process.cwd(), '.env'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const idx = trimmed.indexOf('=');
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim();
            if (key && !process.env[key]) {
              process.env[key] = val;
            }
          }
        }
        console.log(`[ARTECH Electron] Loaded environment from: ${p}`);
        break;
      } catch (err) {
        console.error('[ARTECH Electron] Error loading .env:', err);
      }
    }
  }
}

async function startServerIfNeeded() {
  const isLocal = CONFIG.url.includes('localhost') || CONFIG.url.includes('127.0.0.1');
  if (!isLocal) return;

  const isAvailable = await checkUrlAvailable('http://localhost:8080/api/healthz');
  if (isAvailable) {
    console.log('[ARTECH Electron] Existing server detected on port 8080.');
    return;
  }

  loadEnv();

  // Load server in-process via require
  const serverPaths = [
    path.join(__dirname, 'server', 'server.cjs'),
    path.join(__dirname, 'server', 'index.js'),
    path.join(exeDir, 'resources', 'app', 'server', 'server.cjs'),
    path.join(__dirname, '..', '..', 'build', 'server', 'server.cjs'),
  ];

  for (const sp of serverPaths) {
    if (fs.existsSync(sp)) {
      console.log(`[ARTECH Electron] Starting internal server from: ${sp}`);
      try {
        require(sp);
        console.log('[ARTECH Electron] Internal server initialized.');
      } catch (err) {
        console.error('[ARTECH Electron] Internal server error:', err);
      }
      break;
    }
  }
}

function getLoadingHtml(url) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>ARTECH Station</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #08090C;
      color: #E2E8F0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      overflow: hidden;
      user-select: none;
    }
    .card {
      text-align: center;
      padding: 44px 50px;
      background: rgba(18, 20, 26, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 24px;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.1);
      max-width: 460px;
      width: 90%;
    }
    .spinner {
      width: 48px;
      height: 48px;
      border: 3px solid rgba(255, 255, 255, 0.08);
      border-top-color: #FFFFFF;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 24px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .badge {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.2em;
      color: #94A3B8;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    .title {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #FFFFFF;
      margin-bottom: 12px;
    }
    .status {
      font-size: 13px;
      color: #94A3B8;
      line-height: 1.6;
    }
    .url {
      font-family: monospace;
      font-size: 11px;
      color: #64748B;
      margin-top: 14px;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <div class="badge">ARTECH STATION</div>
    <div class="title">Initializing Booth</div>
    <div class="status">Connecting to event check-in service...</div>
    <div class="url">${url}</div>
  </div>
</body>
</html>`;
}

function getErrorHtml(url) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>ARTECH Station - Offline</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #08090C;
      color: #E2E8F0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      overflow: hidden;
      user-select: none;
    }
    .card {
      text-align: center;
      padding: 44px 50px;
      background: rgba(18, 20, 26, 0.9);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 24px;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.8);
      max-width: 500px;
      width: 90%;
    }
    .icon {
      width: 56px;
      height: 56px;
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      color: #EF4444;
      font-size: 26px;
      font-weight: 900;
    }
    .title {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #FFFFFF;
      margin-bottom: 12px;
    }
    .status {
      font-size: 13px;
      color: #94A3B8;
      line-height: 1.6;
      margin-bottom: 20px;
    }
    .btn {
      display: inline-block;
      padding: 12px 28px;
      background: #FFFFFF;
      color: #08090C;
      font-weight: 700;
      font-size: 13px;
      border-radius: 12px;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s ease;
      border: none;
    }
    .btn:hover {
      background: #E2E8F0;
      transform: translateY(-1px);
    }
    .hint {
      margin-top: 20px;
      font-size: 11px;
      color: #64748B;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">!</div>
    <div class="title">Service Unreachable</div>
    <div class="status">Could not reach the Event Server at<br><strong style="color: #F8FAFC;">${url}</strong></div>
    <button class="btn" onclick="location.reload()">Retry Connection</button>
    <div class="hint">Press <strong>Escape</strong> to exit kiosk mode or edit <strong>station-config.json</strong> next to the application.</div>
  </div>
</body>
</html>`;
}

async function createWindow() {
  registerIpc();
  await startServerIfNeeded();

  const winOpts = isSetupMode
    ? {
        width: 1160,
        height: 820,
        minWidth: 980,
        minHeight: 650,
        center: true,
        fullscreen: false,
        frame: true,
        kiosk: false,
        autoHideMenuBar: true,
        title: 'ARTECH • Printer & Badge Setup Studio',
        backgroundColor: '#08090C',
        webPreferences: {
          preload: preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
        },
      }
    : {
        width: 1280,
        height: 800,
        fullscreen: CONFIG.fullscreen,
        frame: CONFIG.frame,
        kiosk: CONFIG.kiosk,
        autoHideMenuBar: CONFIG.autoHideMenuBar,
        backgroundColor: '#08090C',
        webPreferences: {
          preload: preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
        },
      };

  mainWindow = new BrowserWindow(winOpts);

  mainWindow.webContents.on('before-input-event', (event, input) => {
    // Ctrl+P test print
    if (input.control && input.key.toLowerCase() === 'p') {
      event.preventDefault();
      executeSilentPrint(mainWindow).catch((err) => {
        logToRenderer(mainWindow, `[ARTECH Electron] Print error: ${err.message}`, 'error');
      });
    }

    // Escape key toggles kiosk mode so organizers can access desktop if needed (kiosk only)
    if (input.key === 'Escape' && !isSetupMode) {
      const nextKiosk = !mainWindow.isKiosk();
      mainWindow.setKiosk(nextKiosk);
      if (nextKiosk) {
        setTaskbarVisible(false);
      } else {
        setTaskbarVisible(true);
        mainWindow.setFullScreen(false);
      }
    }

    // F11 toggles fullscreen
    if (input.key === 'F11' && !isSetupMode) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }

    // F12 DevTools
    if (input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
    }

    // Ctrl+R / F5 Reload
    if ((input.control && input.key.toLowerCase() === 'r') || input.key === 'F5') {
      mainWindow.reload();
    }
  });

  const targetUrl = CONFIG.url;

  // Render sleek loading screen immediately to prevent any blank black canvas
  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(getLoadingHtml(targetUrl)));
  if (!isSetupMode) {
    mainWindow.setMenuBarVisibility(false);
    setTaskbarVisible(false);
  }

  // Poll until the server/target responds, then load the real page
  let attempts = 0;
  let hasNavigated = false;
  const maxAttempts = 30; // 15 seconds max wait
  const pollInterval = setInterval(async () => {
    if (!mainWindow || mainWindow.isDestroyed() || hasNavigated) {
      clearInterval(pollInterval);
      return;
    }

    attempts++;
    const isUp = await checkUrlAvailable(targetUrl);
    if (isUp && !hasNavigated) {
      hasNavigated = true;
      clearInterval(pollInterval);
      logToRenderer(mainWindow, `[ARTECH Electron] Connected to ${targetUrl}`);
      mainWindow.loadURL(targetUrl);
    } else if (attempts >= maxAttempts && !hasNavigated) {
      hasNavigated = true;
      clearInterval(pollInterval);
      logToRenderer(mainWindow, `[ARTECH Electron] Failed to connect to ${targetUrl}`, 'warn');
      mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(getErrorHtml(targetUrl)));
    }
  }, 500);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Second instance triggered: focus the main window
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (!isSetupMode) {
    setTaskbarVisible(true);
  }
});
