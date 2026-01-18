import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from 'dotenv';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { healthRoutes } from './routes/health.js';
import { ttsRoutes } from './routes/tts.js';
import { gameRoutes } from './routes/game.js';
import { partyRoutes } from './routes/party.js';
import { evolutionRoutes } from './routes/evolution.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '../../..');
const PORT_FILE = join(PROJECT_ROOT, '.server-port');

// Load environment variables from project root
config({ path: join(PROJECT_ROOT, '.env') });

const server = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

// Register plugins
await server.register(cors, {
  origin: process.env.NODE_ENV === 'production'
    ? false
    : true,  // Allow all origins in development
});

// Register routes
await server.register(healthRoutes, { prefix: '/health' });
await server.register(ttsRoutes, { prefix: '/api/tts' });
await server.register(gameRoutes, { prefix: '/api/game' });
await server.register(partyRoutes, { prefix: '/api/party' });
await server.register(evolutionRoutes, { prefix: '/api/evolution' });

/**
 * Try to start server on a port, incrementing if port is in use.
 * Writes the final port to .server-port file for client discovery.
 */
async function tryListen(startPort: number, host: string, maxAttempts = 10): Promise<number> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = startPort + attempt;
    try {
      await server.listen({ port, host });
      return port;
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error.code === 'EADDRINUSE') {
        console.log(`Port ${port} in use, trying ${port + 1}...`);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Could not find available port after ${maxAttempts} attempts starting from ${startPort}`);
}

// Start server
const start = async () => {
  try {
    const startPort = parseInt(process.env.PORT || '3001', 10);
    const host = process.env.HOST || '0.0.0.0';

    const port = await tryListen(startPort, host);

    // Write port to file for client discovery
    try {
      writeFileSync(PORT_FILE, port.toString(), 'utf-8');
    } catch (e) {
      console.warn('Could not write port file:', e);
    }

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                   RECKONING API SERVER                     ║
╠═══════════════════════════════════════════════════════════╣
║  Status:  Running                                          ║
║  Port:    ${port.toString().padEnd(48)}║
║  Health:  http://localhost:${port}/health                   ║
╚═══════════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
