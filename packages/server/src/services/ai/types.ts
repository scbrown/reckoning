/**
 * AI Provider Types
 *
 * Abstract interfaces for AI backends, enabling swappable implementations.
 */

import { Result } from '@reckoning/shared';

// =============================================================================
// AI Request/Response Types
// =============================================================================

/**
 * Request to an AI provider
 */
export interface AIRequest {
  /** The prompt to send to the AI */
  prompt: string;
  /** Optional system prompt for context */
  systemPrompt?: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
}

/**
 * Response from an AI provider
 */
export interface AIResponse {
  /** The generated content */
  content: string;
  /** Time taken to generate response in milliseconds */
  durationMs: number;
}

// =============================================================================
// AI Error Types
// =============================================================================

/**
 * Error codes for AI operations
 */
export type AIErrorCode =
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'EXECUTION_ERROR'
  | 'PARSE_ERROR';

/**
 * Structured error from AI operations
 */
export interface AIError {
  /** Error classification code */
  code: AIErrorCode;
  /** Human-readable error message */
  message: string;
  /** Whether the operation can be retried */
  retryable: boolean;
}

// =============================================================================
// AI Provider Interface
// =============================================================================

/**
 * Abstract interface for swappable AI backends
 *
 * Implementations can use different backends (CLI, API, local models)
 * while maintaining a consistent interface.
 */
export interface AIProvider {
  /** Unique name identifying this provider */
  readonly name: string;

  /**
   * Execute a prompt and return the AI's response
   *
   * @param request - The AI request containing prompt and options
   * @returns Result with AIResponse on success, AIError on failure
   */
  execute(request: AIRequest): Promise<Result<AIResponse, AIError>>;

  /**
   * Check if the provider is available and ready to handle requests
   *
   * @returns true if provider can accept requests, false otherwise
   */
  isAvailable(): Promise<boolean>;
}
