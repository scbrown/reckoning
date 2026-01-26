import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResearchConsole, type ResearchConsoleEvent } from '../research-console.js';

// =============================================================================
// Mock EventSource
// =============================================================================

class MockEventSource {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((error: Event) => void) | null = null;

  constructor(public url: string) {
    // Simulate async connection
    setTimeout(() => {
      this.onopen?.();
    }, 0);
  }

  close(): void {
    // Mock close
  }

  simulateMessage(data: ResearchConsoleEvent): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateError(error: Event): void {
    this.onerror?.(error);
  }
}

// Replace global EventSource
const originalEventSource = global.EventSource;

// =============================================================================
// Mock Fetch
// =============================================================================

const mockFetch = vi.fn();

// =============================================================================
// Tests
// =============================================================================

describe('ResearchConsole', () => {
  let container: HTMLElement;
  let mockEventSource: MockEventSource | null = null;

  beforeEach(() => {
    // Create container
    container = document.createElement('div');
    container.id = 'test-research-console';
    document.body.appendChild(container);

    // Mock EventSource
    // @ts-expect-error - Mocking global
    global.EventSource = vi.fn((url: string) => {
      mockEventSource = new MockEventSource(url);
      return mockEventSource;
    });

    // Mock fetch
    global.fetch = mockFetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sent: true }),
    });
  });

  afterEach(() => {
    document.body.removeChild(container);
    const styles = document.getElementById('research-console-styles');
    if (styles) {
      styles.remove();
    }
    global.EventSource = originalEventSource;
    vi.clearAllMocks();
    mockEventSource = null;
  });

  describe('constructor', () => {
    it('should throw if container element is not found', () => {
      expect(() => {
        new ResearchConsole({
          containerId: 'non-existent',
          gameId: 'game-1',
          sessionId: 'session-1',
        });
      }).toThrow('Container element #non-existent not found');
    });

    it('should initialize with provided config', () => {
      const console = new ResearchConsole({
        containerId: 'test-research-console',
        gameId: 'game-1',
        sessionId: 'session-1',
      });
      expect(console).toBeDefined();
    });
  });

  describe('render', () => {
    it('should create correct DOM structure', () => {
      const researchConsole = new ResearchConsole({
        containerId: 'test-research-console',
        gameId: 'game-1',
        sessionId: 'session-1',
      });
      researchConsole.render();

      expect(container.querySelector('.research-console')).not.toBeNull();
      expect(container.querySelector('.research-console-header')).not.toBeNull();
      expect(container.querySelector('.research-console-output')).not.toBeNull();
      expect(container.querySelector('.research-console-input')).not.toBeNull();
      expect(container.querySelector('.research-console-send')).not.toBeNull();
    });

    it('should set correct accessibility attributes', () => {
      const researchConsole = new ResearchConsole({
        containerId: 'test-research-console',
        gameId: 'game-1',
        sessionId: 'session-1',
      });
      researchConsole.render();

      const output = container.querySelector('.research-console-output');
      expect(output?.getAttribute('role')).toBe('log');
      expect(output?.getAttribute('aria-live')).toBe('polite');

      const input = container.querySelector('.research-console-input');
      expect(input?.getAttribute('aria-label')).toBe('Research guidance input');
    });

    it('should have auto-scroll toggle checked by default', () => {
      const researchConsole = new ResearchConsole({
        containerId: 'test-research-console',
        gameId: 'game-1',
        sessionId: 'session-1',
      });
      researchConsole.render();

      const checkbox = container.querySelector(
        '.auto-scroll-toggle input'
      ) as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
    });
  });

  describe('connect', () => {
    it('should create EventSource with correct URL', async () => {
      const researchConsole = new ResearchConsole({
        containerId: 'test-research-console',
        gameId: 'game-1',
        sessionId: 'session-1',
      });
      researchConsole.render();
      researchConsole.connect();

      expect(global.EventSource).toHaveBeenCalledWith(
        '/api/game/game-1/seed/events?session=session-1'
      );
    });

    it('should update status on connection', async () => {
      const researchConsole = new ResearchConsole({
        containerId: 'test-research-console',
        gameId: 'game-1',
        sessionId: 'session-1',
      });
      researchConsole.render();
      researchConsole.connect();

      // Wait for async connection
      await new Promise((resolve) => setTimeout(resolve, 10));

      const status = container.querySelector('.research-console-status');
      expect(status?.textContent).toBe('Connected');
    });
  });

  describe('event handling', () => {
    it('should append console output', async () => {
      const researchConsole = new ResearchConsole({
        containerId: 'test-research-console',
        gameId: 'game-1',
        sessionId: 'session-1',
      });
      researchConsole.render();
      researchConsole.connect();

      await new Promise((resolve) => setTimeout(resolve, 10));

      mockEventSource?.simulateMessage({
        type: 'console',
        data: 'Hello, World!',
      });

      const output = container.querySelector('.research-console-output');
      expect(output?.textContent).toContain('Hello, World!');
    });

    it('should update status on worldseed event', async () => {
      const researchConsole = new ResearchConsole({
        containerId: 'test-research-console',
        gameId: 'game-1',
        sessionId: 'session-1',
      });
      researchConsole.render();
      researchConsole.connect();

      await new Promise((resolve) => setTimeout(resolve, 10));

      mockEventSource?.simulateMessage({
        type: 'worldseed',
        seed: { setting: 'Test World' },
      });

      const status = container.querySelector('.research-console-status');
      expect(status?.textContent).toBe('WorldSeed received');
    });

    it('should display error messages', async () => {
      const researchConsole = new ResearchConsole({
        containerId: 'test-research-console',
        gameId: 'game-1',
        sessionId: 'session-1',
      });
      researchConsole.render();
      researchConsole.connect();

      await new Promise((resolve) => setTimeout(resolve, 10));

      mockEventSource?.simulateMessage({
        type: 'error',
        message: 'Something went wrong',
      });

      const output = container.querySelector('.research-console-output');
      expect(output?.textContent).toContain('[ERROR] Something went wrong');
    });

    it('should disable input on complete', async () => {
      const researchConsole = new ResearchConsole({
        containerId: 'test-research-console',
        gameId: 'game-1',
        sessionId: 'session-1',
      });
      researchConsole.render();
      researchConsole.connect();

      await new Promise((resolve) => setTimeout(resolve, 10));

      mockEventSource?.simulateMessage({ type: 'complete' });

      const input = container.querySelector(
        '.research-console-input'
      ) as HTMLInputElement;
      expect(input.disabled).toBe(true);
      expect(researchConsole.isSessionComplete()).toBe(true);
    });

    it('should call registered event handlers', async () => {
      const researchConsole = new ResearchConsole({
        containerId: 'test-research-console',
        gameId: 'game-1',
        sessionId: 'session-1',
      });
      researchConsole.render();

      const handler = vi.fn();
      researchConsole.on('worldseed', handler);

      researchConsole.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      mockEventSource?.simulateMessage({
        type: 'worldseed',
        seed: { setting: 'Test' },
      });

      expect(handler).toHaveBeenCalledWith({
        type: 'worldseed',
        seed: { setting: 'Test' },
      });
    });
  });

  describe('sendInput', () => {
    it('should send input to API', async () => {
      const researchConsole = new ResearchConsole({
        containerId: 'test-research-console',
        gameId: 'game-1',
        sessionId: 'session-1',
      });
      researchConsole.render();
      researchConsole.connect();

      await new Promise((resolve) => setTimeout(resolve, 10));

      const input = container.querySelector(
        '.research-console-input'
      ) as HTMLInputElement;
      input.value = 'Add more dragons';

      // Trigger Enter key
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFetch).toHaveBeenCalledWith('/api/game/game-1/seed/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'session-1', input: 'Add more dragons' }),
      });
    });

    it('should show input in console output', async () => {
      const researchConsole = new ResearchConsole({
        containerId: 'test-research-console',
        gameId: 'game-1',
        sessionId: 'session-1',
      });
      researchConsole.render();
      researchConsole.connect();

      await new Promise((resolve) => setTimeout(resolve, 10));

      const input = container.querySelector(
        '.research-console-input'
      ) as HTMLInputElement;
      input.value = 'Add more dragons';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      const output = container.querySelector('.research-console-output');
      expect(output?.textContent).toContain('> Add more dragons');
    });

    it('should clear input field after sending', async () => {
      const researchConsole = new ResearchConsole({
        containerId: 'test-research-console',
        gameId: 'game-1',
        sessionId: 'session-1',
      });
      researchConsole.render();
      researchConsole.connect();

      await new Promise((resolve) => setTimeout(resolve, 10));

      const input = container.querySelector(
        '.research-console-input'
      ) as HTMLInputElement;
      input.value = 'Add more dragons';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(input.value).toBe('');
    });

    it('should not send empty input', async () => {
      const researchConsole = new ResearchConsole({
        containerId: 'test-research-console',
        gameId: 'game-1',
        sessionId: 'session-1',
      });
      researchConsole.render();
      researchConsole.connect();

      await new Promise((resolve) => setTimeout(resolve, 10));

      const input = container.querySelector(
        '.research-console-input'
      ) as HTMLInputElement;
      input.value = '   ';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('appendOutput', () => {
    it('should append text to output', () => {
      const researchConsole = new ResearchConsole({
        containerId: 'test-research-console',
        gameId: 'game-1',
        sessionId: 'session-1',
      });
      researchConsole.render();

      researchConsole.appendOutput('Line 1\n');
      researchConsole.appendOutput('Line 2\n');

      const output = container.querySelector('.research-console-output');
      expect(output?.textContent).toBe('Line 1\nLine 2\n');
    });
  });

  describe('clear', () => {
    it('should clear output', () => {
      const researchConsole = new ResearchConsole({
        containerId: 'test-research-console',
        gameId: 'game-1',
        sessionId: 'session-1',
      });
      researchConsole.render();

      researchConsole.appendOutput('Some text');
      researchConsole.clear();

      const output = container.querySelector('.research-console-output');
      expect(output?.textContent).toBe('');
    });
  });

  describe('destroy', () => {
    it('should clean up resources', () => {
      const researchConsole = new ResearchConsole({
        containerId: 'test-research-console',
        gameId: 'game-1',
        sessionId: 'session-1',
      });
      researchConsole.render();
      researchConsole.connect();
      researchConsole.destroy();

      expect(container.innerHTML).toBe('');
    });
  });

  describe('event handler management', () => {
    it('should remove event handler with off()', async () => {
      const researchConsole = new ResearchConsole({
        containerId: 'test-research-console',
        gameId: 'game-1',
        sessionId: 'session-1',
      });
      researchConsole.render();

      const handler = vi.fn();
      researchConsole.on('console', handler);
      researchConsole.off('console', handler);

      researchConsole.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      mockEventSource?.simulateMessage({ type: 'console', data: 'test' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should return unsubscribe function from on()', async () => {
      const researchConsole = new ResearchConsole({
        containerId: 'test-research-console',
        gameId: 'game-1',
        sessionId: 'session-1',
      });
      researchConsole.render();

      const handler = vi.fn();
      const unsubscribe = researchConsole.on('console', handler);
      unsubscribe();

      researchConsole.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      mockEventSource?.simulateMessage({ type: 'console', data: 'test' });

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
