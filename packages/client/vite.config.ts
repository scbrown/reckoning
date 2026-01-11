import { defineConfig } from 'vite';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '../..');
const PORT_FILE = join(PROJECT_ROOT, '.server-port');

/**
 * Read server port from .server-port file, with fallback.
 * Server writes this file on startup for client discovery.
 */
function getServerPort(): number {
  try {
    if (existsSync(PORT_FILE)) {
      const port = parseInt(readFileSync(PORT_FILE, 'utf-8').trim(), 10);
      if (!isNaN(port)) {
        console.log(`[vite] Using server port from .server-port: ${port}`);
        return port;
      }
    }
  } catch (e) {
    // Ignore read errors
  }
  console.log('[vite] No .server-port file found, using default port 3001');
  return 3001;
}

const serverPort = getServerPort();

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api/health': {
        target: `http://localhost:${serverPort}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api': {
        target: `http://localhost:${serverPort}`,
        changeOrigin: true,
        // Don't rewrite - server routes include /api prefix
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
    ],
  },
});
