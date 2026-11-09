import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const harness = process.env.SZH_HARNESS_URL || 'http://127.0.0.1:4782';

/** Dev server only: React Fast Refresh needs an inline preamble and an HMR websocket. Production CSP stays strict. */
const devCsp = (): Plugin => ({
  name: 'szh-dev-csp',
  apply: 'serve',
  transformIndexHtml: (html) => html
    .replace("default-src 'self';", "default-src 'self'; script-src 'self' 'unsafe-inline';")
    .replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:* ws://localhost:*"),
});

// One renderer build serves both the Electron client (file://) and a future web deployment.
export default defineConfig({
  base: './',
  plugins: [react(), devCsp()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5183, strictPort: true, proxy: { '/api': harness } },
  build: { outDir: 'dist', emptyOutDir: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as any);
