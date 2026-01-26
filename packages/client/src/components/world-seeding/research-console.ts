/**
 * Research Console Component
 *
 * Displays Claude Code output during world seeding research sessions.
 * Allows DM to provide guidance and see real-time progress.
 */

export interface ResearchConsoleConfig {
  containerId: string;
  gameId: string;
  sessionId: string;
}

export type ResearchConsoleEventType = 'console' | 'worldseed' | 'error' | 'complete';

export interface ResearchConsoleEvent {
  type: ResearchConsoleEventType;
  data?: string;
  seed?: unknown;
  message?: string;
}

export type ResearchConsoleEventHandler = (event: ResearchConsoleEvent) => void;

/**
 * Research Console component for streaming Claude Code output during world seeding
 */
export class ResearchConsole {
  private container: HTMLElement;
  private gameId: string;
  private sessionId: string;
  private outputElement: HTMLPreElement | null = null;
  private inputElement: HTMLInputElement | null = null;
  private eventSource: EventSource | null = null;
  private autoScroll: boolean = true;
  private isComplete: boolean = false;
  private handlers: Map<ResearchConsoleEventType, Set<ResearchConsoleEventHandler>> = new Map();

  constructor(config: ResearchConsoleConfig) {
    const container = document.getElementById(config.containerId);
    if (!container) {
      throw new Error(`Container element #${config.containerId} not found`);
    }
    this.container = container;
    this.gameId = config.gameId;
    this.sessionId = config.sessionId;
    this.injectStyles();
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Render the component
   */
  render(): void {
    this.container.innerHTML = `
      <div class="research-console" role="region" aria-label="Research Console - Claude Code output">
        <div class="research-console-header">
          <span class="research-console-title">Research Console</span>
          <div class="research-console-controls">
            <label class="auto-scroll-toggle">
              <input type="checkbox" checked />
              <span>Auto-scroll</span>
            </label>
            <span class="research-console-status" role="status" aria-live="polite">Connecting...</span>
          </div>
        </div>
        <div class="research-console-content">
          <pre class="research-console-output" role="log" aria-live="polite" aria-label="Claude Code output"></pre>
        </div>
        <div class="research-console-input-area">
          <input
            type="text"
            class="research-console-input"
            placeholder="Type to guide research... (Enter to send)"
            aria-label="Research guidance input"
          />
          <button class="research-console-send" aria-label="Send guidance">Send</button>
        </div>
      </div>
    `;

    this.outputElement = this.container.querySelector('.research-console-output');
    this.inputElement = this.container.querySelector('.research-console-input');

    // Set up auto-scroll toggle
    const checkbox = this.container.querySelector('.auto-scroll-toggle input') as HTMLInputElement;
    if (checkbox) {
      checkbox.addEventListener('change', () => {
        this.autoScroll = checkbox.checked;
        if (this.autoScroll) {
          this.scrollToBottom();
        }
      });
    }

    // Set up input handling
    if (this.inputElement) {
      this.inputElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.sendInput();
        }
      });
    }

    // Set up send button
    const sendButton = this.container.querySelector('.research-console-send');
    if (sendButton) {
      sendButton.addEventListener('click', () => this.sendInput());
    }
  }

  /**
   * Connect to the SSE endpoint for console streaming
   */
  connect(): void {
    if (this.eventSource) {
      this.disconnect();
    }

    this.isComplete = false;
    this.updateStatus('Connecting...');

    const url = `/api/game/${this.gameId}/seed/events?session=${this.sessionId}`;
    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      console.log('[ResearchConsole] Connected');
      this.updateStatus('Connected');
    };

    this.eventSource.onmessage = (event) => {
      try {
        const data: ResearchConsoleEvent = JSON.parse(event.data);
        this.handleEvent(data);
      } catch (error) {
        console.error('[ResearchConsole] Failed to parse event:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('[ResearchConsole] Connection error:', error);
      if (!this.isComplete) {
        this.updateStatus('Connection error');
      }
    };
  }

  /**
   * Disconnect from the SSE endpoint
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.updateStatus('Disconnected');
  }

  /**
   * Register an event handler
   */
  on(eventType: ResearchConsoleEventType, handler: ResearchConsoleEventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);

    return () => this.off(eventType, handler);
  }

  /**
   * Remove an event handler
   */
  off(eventType: ResearchConsoleEventType, handler: ResearchConsoleEventHandler): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Append text to the console output
   */
  appendOutput(text: string): void {
    if (!this.outputElement) return;

    this.outputElement.textContent += text;

    if (this.autoScroll) {
      this.scrollToBottom();
    }
  }

  /**
   * Clear the console output
   */
  clear(): void {
    if (this.outputElement) {
      this.outputElement.textContent = '';
    }
  }

  /**
   * Scroll to the bottom of the output
   */
  scrollToBottom(): void {
    if (this.outputElement) {
      this.outputElement.scrollTop = this.outputElement.scrollHeight;
    }
  }

  /**
   * Set the enabled state of the input
   */
  setInputEnabled(enabled: boolean): void {
    if (this.inputElement) {
      this.inputElement.disabled = !enabled;
    }
    const sendButton = this.container.querySelector('.research-console-send') as HTMLButtonElement;
    if (sendButton) {
      sendButton.disabled = !enabled;
    }
  }

  /**
   * Check if the session is complete
   */
  isSessionComplete(): boolean {
    return this.isComplete;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.disconnect();
    this.handlers.clear();
    this.container.innerHTML = '';
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private handleEvent(event: ResearchConsoleEvent): void {
    switch (event.type) {
      case 'console':
        if (event.data) {
          this.appendOutput(event.data);
        }
        break;

      case 'worldseed':
        this.updateStatus('WorldSeed received');
        break;

      case 'error':
        this.appendOutput(`\n[ERROR] ${event.message || 'Unknown error'}\n`);
        this.updateStatus('Error');
        break;

      case 'complete':
        this.isComplete = true;
        this.updateStatus('Complete');
        this.setInputEnabled(false);
        break;
    }

    // Emit to registered handlers
    this.emit(event.type, event);
  }

  private emit(eventType: ResearchConsoleEventType, event: ResearchConsoleEvent): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(event);
        } catch (error) {
          console.error(`[ResearchConsole] Handler error for ${eventType}:`, error);
        }
      });
    }
  }

  private async sendInput(): Promise<void> {
    if (!this.inputElement || this.isComplete) return;

    const input = this.inputElement.value.trim();
    if (!input) return;

    // Show the input in the console
    this.appendOutput(`\n> ${input}\n`);
    this.inputElement.value = '';

    try {
      const response = await fetch(`/api/game/${this.gameId}/seed/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId, input }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        this.appendOutput(`[ERROR] Failed to send input: ${errorData.error || 'Unknown error'}\n`);
      }
    } catch (error) {
      console.error('[ResearchConsole] Failed to send input:', error);
      this.appendOutput(`[ERROR] Failed to send input: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    }
  }

  private updateStatus(status: string): void {
    const statusEl = this.container.querySelector('.research-console-status');
    if (statusEl) {
      statusEl.textContent = status;
      statusEl.className = `research-console-status status-${status.toLowerCase().replace(/\s+/g, '-')}`;
    }
  }

  private injectStyles(): void {
    if (document.getElementById('research-console-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'research-console-styles';
    styles.textContent = `
      .research-console {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #0a0a0a;
        border: 1px solid #333;
        border-radius: 8px;
        overflow: hidden;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      }

      .research-console-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1rem;
        background: #111;
        border-bottom: 1px solid #333;
      }

      .research-console-title {
        font-weight: 600;
        color: #e0e0e0;
        font-size: 0.9rem;
      }

      .research-console-controls {
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      .research-console .auto-scroll-toggle {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.8rem;
        font-weight: normal;
        color: #888;
        cursor: pointer;
      }

      .research-console .auto-scroll-toggle input {
        cursor: pointer;
        accent-color: #667eea;
      }

      .research-console-status {
        font-size: 0.75rem;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        background: #222;
        color: #888;
      }

      .research-console-status.status-connected {
        background: #16a34a;
        color: white;
      }

      .research-console-status.status-connecting\.\.\. {
        background: #667eea;
        color: white;
        animation: pulse 1.5s infinite;
      }

      .research-console-status.status-complete {
        background: #16a34a;
        color: white;
      }

      .research-console-status.status-error,
      .research-console-status.status-connection-error {
        background: #dc2626;
        color: white;
      }

      .research-console-status.status-worldseed-received {
        background: #764ba2;
        color: white;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }

      .research-console-content {
        flex: 1;
        position: relative;
        min-height: 200px;
        overflow: hidden;
      }

      .research-console-output {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 1rem;
        background: #0a0a0a;
        color: #00ff00;
        font-size: 0.875rem;
        line-height: 1.5;
        overflow-y: auto;
        white-space: pre-wrap;
        word-wrap: break-word;
      }

      .research-console-output::-webkit-scrollbar {
        width: 8px;
      }

      .research-console-output::-webkit-scrollbar-track {
        background: #111;
      }

      .research-console-output::-webkit-scrollbar-thumb {
        background: #333;
        border-radius: 4px;
      }

      .research-console-output::-webkit-scrollbar-thumb:hover {
        background: #444;
      }

      .research-console-input-area {
        display: flex;
        gap: 0.5rem;
        padding: 0.75rem 1rem;
        background: #111;
        border-top: 1px solid #333;
      }

      .research-console-input {
        flex: 1;
        padding: 0.5rem 0.75rem;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 4px;
        color: #e0e0e0;
        font-family: inherit;
        font-size: 0.875rem;
        outline: none;
        transition: border-color 0.2s;
      }

      .research-console-input:focus {
        border-color: #667eea;
      }

      .research-console-input::placeholder {
        color: #555;
      }

      .research-console-input:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .research-console-send {
        padding: 0.5rem 1rem;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border: none;
        border-radius: 4px;
        color: white;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: opacity 0.2s;
      }

      .research-console-send:hover {
        opacity: 0.9;
      }

      .research-console-send:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `;
    document.head.appendChild(styles);
  }
}

export default ResearchConsole;
