import { contextBridge, ipcRenderer } from 'electron';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

// Narrow, read-mostly bridge. No filesystem or shell access is exposed to the renderer.
contextBridge.exposeInMainWorld('szhDesktop', {
  isDesktop: true,
  platform: arg('szh-platform') || 'win32',
  harnessUrl: arg('szh-harness') || 'http://127.0.0.1:4782',
  toggleMaximize: () => ipcRenderer.invoke('szh:window-toggle-maximize'),
  onWindowState: (callback: (state: { maximized: boolean; focused: boolean }) => void) => {
    const listener = (_: unknown, state: { maximized: boolean; focused: boolean }) => callback(state);
    ipcRenderer.on('szh:window-state', listener);
    return () => ipcRenderer.removeListener('szh:window-state', listener);
  },
});
