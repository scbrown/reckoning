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
  /** Model to use (default: 'haiku' for speed) */
  model?: string;
}

interface RequiredConfig {
  timeout: number;
  maxOutputLength: number;
  cliCommand: string;
  model: string;
}

const DEFAULT_CONFIG: RequiredConfig = {
  timeout: 30000, // 30 seconds - haiku is fast
  maxOutputLength: 50000,
  cliCommand: '/home/admin/.npm-global/bin/claude',
  model: 'haiku', // Fast model for generation
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
    console.log(`[ClaudeCLI] Executing prompt (${request.prompt.length} chars) with model: ${this.config.model}`);
    console.log('[ClaudeCLI] ─────────────────── PROMPT START ───────────────────');
    console.log(request.prompt);
    console.log('[ClaudeCLI] ─────────────────── PROMPT END ─────────────────────');

    try {
      const result = await this.spawnClaude(request.prompt);

      const durationMs = Date.now() - startTime;

      if (result.exitCode !== 0) {
        console.error(`[ClaudeCLI] Failed with exit code ${result.exitCode} after ${durationMs}ms`);
        console.error(`[ClaudeCLI] stderr: ${result.stderr}`);
        return Err({
          code: 'EXECUTION_ERROR',
          message: `Claude CLI exited with code ${result.exitCode}: ${result.stderr}`,
          retryable: result.exitCode === 1, // Exit code 1 is often transient
        });
      }

      const content = result.stdout.trim();

      if (!content) {
        console.error(`[ClaudeCLI] Empty output after ${durationMs}ms`);
        return Err({
          code: 'PARSE_ERROR',
          message: 'Claude CLI returned empty output',
          retryable: true,
        });
      }

      console.log(`[ClaudeCLI] Success after ${durationMs}ms (${content.length} chars)`);
      console.log('[ClaudeCLI] ─────────────────── RESPONSE START ─────────────────');
      console.log(content);
      console.log('[ClaudeCLI] ─────────────────── RESPONSE END ───────────────────');
      return Ok({
        content,
        durationMs,
      });
    } catch (error) {
      const elapsed = Date.now() - startTime;
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.message.includes('aborted')) {
          console.error(`[ClaudeCLI] Timed out after ${elapsed}ms (limit: ${this.config.timeout}ms)`);
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
      // Determine args: for --version check, just pass it directly
      // For prompts, use --model and -p flags
      const isFlag = prompt.startsWith('-');
      const args = isFlag ? [prompt] : ['--model', this.config.model, '-p', prompt];

      console.log(`[ClaudeCLI] Spawning: ${this.config.cliCommand} --model ${this.config.model} -p "<prompt>"`);
      console.log(`[ClaudeCLI] CWD: ${process.cwd()}, PATH includes npm-global: ${process.env.PATH?.includes('.npm-global') ?? false}`);

      const proc = spawn(this.config.cliCommand, args, {
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],  // Close stdin - claude waits for it otherwise
      });

      // Handle timeout manually
      const killOnTimeout = setTimeout(() => {
        console.error(`[ClaudeCLI] Main timeout reached (${this.config.timeout}ms) - killing process`);
        proc.kill('SIGTERM');
      }, this.config.timeout);

      let stdout = '';
      let stderr = '';
      let truncated = false;
      let hasOutput = false;

      // Early bail-out: if no output within 20 seconds, something is wrong
      const earlyBailout = setTimeout(() => {
        if (!hasOutput) {
          console.error('[ClaudeCLI] No output received within 20 seconds - killing process');
          proc.kill();
        }
      }, 20000);

      proc.stdout.on('data', (data: Buffer) => {
        hasOutput = true;
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
        const chunk = data.toString();
        stderr += chunk;
        console.log(`[ClaudeCLI] stderr: ${chunk}`);
      });

      proc.on('close', (code: number | null) => {
        clearTimeout(killOnTimeout);
        clearTimeout(earlyBailout);
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      });

      proc.on('error', (err: Error) => {
        console.error(`[ClaudeCLI] Spawn error: ${err.message}`);
        clearTimeout(killOnTimeout);
        clearTimeout(earlyBailout);
        reject(err);
      });
    });
  }
}
