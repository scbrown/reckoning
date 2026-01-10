import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from 'dotenv';

import { healthRoutes } from './routes/health.js';
import { ttsRoutes } from './routes/tts.js';

// Load environment variables
config();

const server = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

// Register plugins
await server.register(cors, {
  origin: process.env.NODE_ENV === 'production'
    ? false
    : ['http://localhost:5173', 'http://localhost:3000'],
});

// Register routes
await server.register(healthRoutes, { prefix: '/api/health' });
await server.register(ttsRoutes, { prefix: '/api/tts' });

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3001', 10);
    const host = process.env.HOST || '0.0.0.0';

    await server.listen({ port, host });

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                   RECKONING API SERVER                     ║
╠═══════════════════════════════════════════════════════════╣
║  Status:  Running                                          ║
║  Port:    ${port.toString().padEnd(48)}║
║  Health:  http://localhost:${port}/api/health               ║
║  TTS:     http://localhost:${port}/api/tts/speak            ║
╚═══════════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
