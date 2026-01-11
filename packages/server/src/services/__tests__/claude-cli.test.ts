import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { ClaudeCodeCLI } from '../ai/claude-cli.js';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);

// Helper to create a mock child process
function createMockProcess(): ChildProcess & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  emit: (event: string, ...args: unknown[]) => boolean;
} {
  const proc = new EventEmitter() as ChildProcess & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    emit: (event: string, ...args: unknown[]) => boolean;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  return proc;
}

describe('ClaudeCodeCLI', () => {
  let cli: ClaudeCodeCLI;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    cli = new ClaudeCodeCLI({
      timeout: 5000,
      maxOutputLength: 1000,
      cliCommand: 'claude',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should use default values when no config provided', () => {
      const defaultCli = new ClaudeCodeCLI();
      expect(defaultCli.name).toBe('claude-cli');
    });

    it('should accept custom configuration', () => {
      const customCli = new ClaudeCodeCLI({
        timeout: 30000,
        maxOutputLength: 10000,
        cliCommand: '/usr/local/bin/claude',
      });
      expect(customCli.name).toBe('claude-cli');
    });
  });

  describe('execute', () => {
    it('should execute prompt and return response', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const executePromise = cli.execute({ prompt: 'Hello, Claude!' });

      // Simulate successful output
      process.nextTick(() => {
        mockProc.stdout.emit('data', Buffer.from('Hello! How can I help?'));
        mockProc.emit('close', 0);
      });

      await vi.runAllTimersAsync();
      const result = await executePromise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('Hello! How can I help?');
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      }

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        ['--model', 'haiku', '-p', 'Hello, Claude!'],
        expect.objectContaining({
          env: expect.any(Object),
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      );
    });

    it('should return EXECUTION_ERROR for non-zero exit code', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const executePromise = cli.execute({ prompt: 'test' });

      process.nextTick(() => {
        mockProc.stderr.emit('data', Buffer.from('Error: Something went wrong'));
        mockProc.emit('close', 1);
      });

      await vi.runAllTimersAsync();
      const result = await executePromise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('EXECUTION_ERROR');
        expect(result.error.message).toContain('exited with code 1');
        expect(result.error.retryable).toBe(true); // Exit code 1 is retryable
      }
    });

    it('should return PARSE_ERROR for empty output', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const executePromise = cli.execute({ prompt: 'test' });

      process.nextTick(() => {
        mockProc.emit('close', 0);
      });

      await vi.runAllTimersAsync();
      const result = await executePromise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PARSE_ERROR');
        expect(result.error.message).toContain('empty output');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should return TIMEOUT when process times out', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const executePromise = cli.execute({ prompt: 'test' });

      // Don't emit close - let it timeout
      await vi.advanceTimersByTimeAsync(6000);

      // AbortController should have fired
      process.nextTick(() => {
        const abortError = new Error('aborted');
        abortError.name = 'AbortError';
        mockProc.emit('error', abortError);
      });

      await vi.runAllTimersAsync();
      const result = await executePromise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('TIMEOUT');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should return UNAVAILABLE when CLI not found', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const executePromise = cli.execute({ prompt: 'test' });

      process.nextTick(() => {
        mockProc.emit('error', new Error('spawn ENOENT'));
      });

      await vi.runAllTimersAsync();
      const result = await executePromise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UNAVAILABLE');
        expect(result.error.message).toContain('not found');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('should truncate output that exceeds maxOutputLength', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const executePromise = cli.execute({ prompt: 'test' });

      // Emit more data than maxOutputLength (1000)
      process.nextTick(() => {
        const longOutput = 'x'.repeat(1500);
        mockProc.stdout.emit('data', Buffer.from(longOutput));
        mockProc.emit('close', 0);
      });

      await vi.runAllTimersAsync();
      const result = await executePromise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content.length).toBe(1000);
      }

      expect(mockProc.kill).toHaveBeenCalled();
    });

    it('should handle non-zero exit codes other than 1 as non-retryable', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const executePromise = cli.execute({ prompt: 'test' });

      process.nextTick(() => {
        mockProc.stderr.emit('data', Buffer.from('Fatal error'));
        mockProc.emit('close', 2);
      });

      await vi.runAllTimersAsync();
      const result = await executePromise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('EXECUTION_ERROR');
        expect(result.error.retryable).toBe(false);
      }
    });
  });

  describe('isAvailable', () => {
    it('should return true when CLI is available', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const availablePromise = cli.isAvailable();

      process.nextTick(() => {
        mockProc.stdout.emit('data', Buffer.from('claude-code v1.0.0'));
        mockProc.emit('close', 0);
      });

      await vi.runAllTimersAsync();
      const result = await availablePromise;

      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        ['--version'],
        expect.any(Object)
      );
    });

    it('should return false when CLI returns non-zero exit code', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const availablePromise = cli.isAvailable();

      process.nextTick(() => {
        mockProc.emit('close', 1);
      });

      await vi.runAllTimersAsync();
      const result = await availablePromise;

      expect(result).toBe(false);
    });

    it('should return false when CLI spawn fails', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const availablePromise = cli.isAvailable();

      process.nextTick(() => {
        mockProc.emit('error', new Error('spawn ENOENT'));
      });

      await vi.runAllTimersAsync();
      const result = await availablePromise;

      expect(result).toBe(false);
    });
  });

  describe('name property', () => {
    it('should return "claude-cli"', () => {
      expect(cli.name).toBe('claude-cli');
    });
  });
});
