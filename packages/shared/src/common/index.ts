/**
 * Common Types
 *
 * Shared utilities and types used across the application.
 */

// =============================================================================
// Result Type (for error handling without exceptions)
// =============================================================================

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// =============================================================================
// API Response Wrapper
// =============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    requestId: string;
    timestamp: string;
  };
}

// =============================================================================
// Health Check
// =============================================================================

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  checks: Record<string, ComponentHealth>;
}

export interface ComponentHealth {
  status: 'healthy' | 'unhealthy';
  latencyMs?: number;
  message?: string;
}
