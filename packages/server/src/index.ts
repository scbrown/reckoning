import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from 'dotenv';

import { healthRoutes } from './routes/health.js';

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
await server.register(healthRoutes, { prefix: '/health' });

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
║  Health:  http://localhost:${port}/health                   ║
╚═══════════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
