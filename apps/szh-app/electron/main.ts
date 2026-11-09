import { app, BrowserWindow, shell, nativeTheme, ipcMain } from 'electron';
import { join } from 'node:path';

/**
 * Electron main process: window chrome and OS integration only.
 * All business logic lives in the renderer and talks to Harness over HTTP.
 */
const DEV_URL = process.env.SZH_DEV_URL; // e.g. http://127.0.0.1:5183
const HARNESS_URL = process.env.SZH_HARNESS_URL || 'http://127.0.0.1:4782';
const DATA = process.env.SZH_DATA === 'mock' || process.env.SZH_DATA === 'harness' ? process.env.SZH_DATA : undefined;
const TITLEBAR_HEIGHT = 44;

function createWindow() {
  nativeTheme.themeSource = 'light';
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#F6F5F2',
    title: 'SZH 科研工作台',
    titleBarStyle: 'hidden',
    // Native min/max/close controls drawn over our own title bar (Windows / Linux).
    titleBarOverlay: process.platform === 'darwin' ? undefined : { color: '#00000000', symbolColor: '#3D4656', height: TITLEBAR_HEIGHT },
    trafficLightPosition: { x: 16, y: 14 },
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      additionalArguments: [`--szh-harness=${HARNESS_URL}`, `--szh-platform=${process.platform}`],
    },
  });

  win.once('ready-to-show', () => win.show());

  // External links open in the system browser; the app window never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith('file://');
    if (allowed) return;
    event.preventDefault();
    // Cross-origin <a download> is treated as navigation; keep Harness artifact downloads inside the app.
    if (url.startsWith(HARNESS_URL) && /\/artifacts\/[^/]+\/download$/.test(url)) win.webContents.downloadURL(url);
    else if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });

  const sendState = () => win.webContents.send('szh:window-state', { maximized: win.isMaximized(), focused: win.isFocused() });
  ['maximize', 'unmaximize', 'focus', 'blur'].forEach((e) => win.on(e as 'focus', sendState));

  if (DEV_URL) void win.loadURL(DATA ? `${DEV_URL}?data=${DATA}` : DEV_URL);
  else void win.loadFile(join(__dirname, '..', 'dist', 'index.html'), DATA ? { query: { data: DATA } } : undefined);

  // Review mode: SZH_CAPTURE=<dir> captures each hash route to PNG, then exits.
  const capture = process.env.SZH_CAPTURE;
  if (capture) {
    win.webContents.once('did-finish-load', async () => {
      const routes = (process.env.SZH_CAPTURE_ROUTES || '/').split(',');
      const fs = await import('node:fs/promises');
      await fs.mkdir(capture, { recursive: true });
      for (const [index, route] of routes.entries()) {
        // "path=name"; the name follows the last "=" so query strings may contain "=".
        const cut = route.lastIndexOf('=');
        const [path, name] = cut > 0 ? [route.slice(0, cut), route.slice(cut + 1)] : [route, ''];
        await win.webContents.executeJavaScript(`location.hash = ${JSON.stringify('#' + path)}`);
        await new Promise((r) => setTimeout(r, Number(process.env.SZH_CAPTURE_DELAY || 1800)));
        const image = await win.webContents.capturePage();
        await fs.writeFile(join(capture, `${name || String(index).padStart(2, '0')}.png`), image.toPNG());
      }
      app.quit();
    });
  }
}

ipcMain.handle('szh:window-toggle-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize(); else win.maximize();
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
