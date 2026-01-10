/**
 * Claude Code CLI Provider
 *
 * AI provider implementation that uses the Claude CLI via subprocess.
 * Spawns `claude -p "prompt"` to execute prompts.
 */

import { spawn } from 'child_process';
import { Result, Ok, Err } from '@reckoning/shared';
import type { AIProvider, AIRequest, AIResponse, AIError } from './types.js';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Configuration options for ClaudeCodeCLI
 */
export interface ClaudeCLIConfig {
  /** Timeout for CLI execution in milliseconds (default: 60000) */
  timeout?: number;
  /** Maximum output length before truncation (default: 50000) */
  maxOutputLength?: number;
  /** CLI command to execute (default: 'claude') */
  cliCommand?: string;
}

interface RequiredConfig {
  timeout: number;
  maxOutputLength: number;
  cliCommand: string;
}

const DEFAULT_CONFIG: RequiredConfig = {
  timeout: 60000,
  maxOutputLength: 50000,
  cliCommand: 'claude',
};

// =============================================================================
// Subprocess Result
// =============================================================================

interface SubprocessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// =============================================================================
// ClaudeCodeCLI Implementation
// =============================================================================

/**
 * AI provider that executes prompts via the Claude CLI
 *
 * @example
 * ```typescript
 * const cli = new ClaudeCodeCLI({ timeout: 30000 });
 *
 * if (await cli.isAvailable()) {
 *   const result = await cli.execute({ prompt: 'Hello!' });
 *   if (result.ok) {
 *     console.log(result.value.content);
 *   }
 * }
 * ```
 */
export class ClaudeCodeCLI implements AIProvider {
  readonly name = 'claude-cli';
  private config: RequiredConfig;

  constructor(config?: ClaudeCLIConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Execute a prompt via the Claude CLI
   *
   * Spawns a subprocess running `claude -p "prompt"` and captures the output.
   * Handles timeouts, output truncation, and error mapping.
   */
  async execute(request: AIRequest): Promise<Result<AIResponse, AIError>> {
    const startTime = Date.now();

    try {
      const result = await this.spawnClaude(request.prompt);

      const durationMs = Date.now() - startTime;

      if (result.exitCode !== 0) {
        return Err({
          code: 'EXECUTION_ERROR',
          message: `Claude CLI exited with code ${result.exitCode}: ${result.stderr}`,
          retryable: result.exitCode === 1, // Exit code 1 is often transient
        });
      }

      const content = result.stdout.trim();

      if (!content) {
        return Err({
          code: 'PARSE_ERROR',
          message: 'Claude CLI returned empty output',
          retryable: true,
        });
      }

      return Ok({
        content,
        durationMs,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.message.includes('aborted')) {
          return Err({
            code: 'TIMEOUT',
            message: `Claude CLI timed out after ${this.config.timeout}ms`,
            retryable: true,
          });
        }

        if (
          error.message.includes('ENOENT') ||
          error.message.includes('not found')
        ) {
          return Err({
            code: 'UNAVAILABLE',
            message: `Claude CLI not found: ${this.config.cliCommand}`,
            retryable: false,
          });
        }
      }

      return Err({
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        retryable: false,
      });
    }
  }

  /**
   * Check if the Claude CLI is available
   *
   * Runs `claude --version` to verify the CLI is installed and executable.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.spawnClaude('--version');
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Spawn a Claude CLI subprocess
   *
   * @param prompt - The prompt or flag to pass to the CLI
   * @returns Subprocess result with stdout, stderr, and exit code
   */
  private async spawnClaude(prompt: string): Promise<SubprocessResult> {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      // Determine args: for --version check, just pass it directly
      // For prompts, use -p flag
      const isFlag = prompt.startsWith('-');
      const args = isFlag ? [prompt] : ['-p', prompt];

      const proc = spawn(this.config.cliCommand, args, {
        signal: controller.signal,
        shell: true,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';
      let truncated = false;

      proc.stdout.on('data', (data: Buffer) => {
        if (!truncated) {
          stdout += data.toString();
          if (stdout.length > this.config.maxOutputLength) {
            truncated = true;
            stdout = stdout.slice(0, this.config.maxOutputLength);
            proc.kill();
          }
        }
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code: number | null) => {
        clearTimeout(timeoutId);
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      });

      proc.on('error', (err: Error) => {
        clearTimeout(timeoutId);
        reject(err);
      });
    });
  }
}
