import { FastifyInstance } from 'fastify';
import type { HealthStatus, ComponentHealth } from '@reckoning/shared';

const startTime = Date.now();

export async function healthRoutes(fastify: FastifyInstance) {
  /**
   * GET /health
   * Returns overall health status of the server
   */
  fastify.get('/', async (_request, reply) => {
    const checks: Record<string, ComponentHealth> = {};

    // Check Redis (placeholder for now)
    checks.redis = {
      status: 'healthy', // TODO: Actual Redis health check
      message: 'Not yet implemented',
    };

    // Determine overall status
    const allHealthy = Object.values(checks).every(c => c.status === 'healthy');
    const anyUnhealthy = Object.values(checks).some(c => c.status === 'unhealthy');

    const status: HealthStatus = {
      status: anyUnhealthy ? 'unhealthy' : (allHealthy ? 'healthy' : 'degraded'),
      version: '0.1.0',
      uptime: Date.now() - startTime,
      checks,
    };

    const statusCode = status.status === 'healthy' ? 200 : 503;
    return reply.status(statusCode).send(status);
  });

  /**
   * GET /health/ready
   * Readiness probe - is the server ready to accept traffic?
   */
  fastify.get('/ready', async (_request, reply) => {
    // TODO: Check if all required services are connected
    return reply.send({ ready: true });
  });

  /**
   * GET /health/live
   * Liveness probe - is the server process alive?
   */
  fastify.get('/live', async (_request, reply) => {
    return reply.send({ alive: true });
  });
}
