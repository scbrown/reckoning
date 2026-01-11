/**
 * Status Bar Component
 *
 * Displays system status indicators for AI, TTS, and Database subsystems.
 */

import type { SystemStatus, ComponentStatus } from '@reckoning/shared';

export interface StatusBarConfig {
  containerId: string;
}

/**
 * Status indicator configuration
 */
interface StatusIndicator {
  id: string;
  label: string;
  icon: string;
  status: ComponentStatus;
  detail?: string;
}

/**
 * Status Bar component for displaying system status
 */
export class StatusBar {
  private container: HTMLElement;
  private status: SystemStatus | null = null;

  constructor(config: StatusBarConfig) {
    const container = document.getElementById(config.containerId);
    if (!container) {
      throw new Error(`Container element #${config.containerId} not found`);
    }
    this.container = container;
    this.injectStyles();
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Render the component
   */
  render(): void {
    const indicators = this.getIndicators();

    this.container.innerHTML = `
      <div class="status-bar">
        ${indicators.map((ind) => this.renderIndicator(ind)).join('')}
      </div>
    `;
  }

  /**
   * Update system status
   */
  setStatus(status: SystemStatus): void {
    this.status = status;
    this.render();
  }

  /**
   * Get current status
   */
  getStatus(): SystemStatus | null {
    return this.status;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.container.innerHTML = '';
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private getIndicators(): StatusIndicator[] {
    if (!this.status) {
      return [
        { id: 'ai', label: 'AI', icon: '🤖', status: 'offline' },
        { id: 'tts', label: 'TTS', icon: '🔊', status: 'offline' },
        { id: 'db', label: 'DB', icon: '💾', status: 'offline' },
      ];
    }

    return [
      {
        id: 'ai',
        label: 'AI',
        icon: '🤖',
        status: this.status.ai.status,
        detail: this.status.ai.lastGenerationMs
          ? `${this.status.ai.lastGenerationMs}ms`
          : this.status.ai.errorMessage,
      },
      {
        id: 'tts',
        label: 'TTS',
        icon: '🔊',
        status: this.status.tts.status,
        detail:
          this.status.tts.queueLength > 0
            ? `${this.status.tts.queueLength} queued`
            : undefined,
      },
      {
        id: 'db',
        label: 'DB',
        icon: '💾',
        status: this.status.db.status,
        detail: this.status.db.lastSyncAt
          ? this.formatLastSync(this.status.db.lastSyncAt)
          : undefined,
      },
    ];
  }

  private renderIndicator(indicator: StatusIndicator): string {
    const statusClass = this.getStatusClass(indicator.status);
    const statusText = this.getStatusText(indicator.status);
    const tooltip = indicator.detail
      ? `${indicator.label}: ${statusText} - ${indicator.detail}`
      : `${indicator.label}: ${statusText}`;

    return `
      <div class="status-indicator ${statusClass}"
           data-status-id="${indicator.id}"
           title="${this.escapeHtml(tooltip)}">
        <span class="status-icon">${indicator.icon}</span>
        <span class="status-label">${indicator.label}</span>
        <span class="status-dot"></span>
        ${indicator.detail ? `<span class="status-detail">${this.escapeHtml(indicator.detail)}</span>` : ''}
      </div>
    `;
  }

  private getStatusClass(status: ComponentStatus): string {
    switch (status) {
      case 'ok':
        return 'status-ok';
      case 'degraded':
        return 'status-degraded';
      case 'error':
        return 'status-error';
      case 'offline':
        return 'status-offline';
      default:
        return 'status-offline';
    }
  }

  private getStatusText(status: ComponentStatus): string {
    switch (status) {
      case 'ok':
        return 'OK';
      case 'degraded':
        return 'Degraded';
      case 'error':
        return 'Error';
      case 'offline':
        return 'Offline';
      default:
        return 'Unknown';
    }
  }

  private formatLastSync(isoTimestamp: string): string {
    try {
      const date = new Date(isoTimestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSecs = Math.floor(diffMs / 1000);

      if (diffSecs < 60) {
        return `${diffSecs}s ago`;
      }
      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60) {
        return `${diffMins}m ago`;
      }
      const diffHours = Math.floor(diffMins / 60);
      return `${diffHours}h ago`;
    } catch {
      return 'synced';
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private injectStyles(): void {
    if (document.getElementById('status-bar-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'status-bar-styles';
    styles.textContent = `
      .status-bar {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.5rem 1rem;
        background: #111;
        border: 1px solid #333;
        border-radius: 6px;
      }

      .status-indicator {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.3rem 0.6rem;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 4px;
        cursor: default;
        transition: all 0.2s;
      }

      .status-indicator:hover {
        background: #222;
        border-color: #444;
      }

      .status-icon {
        font-size: 0.9rem;
      }

      .status-label {
        font-size: 0.75rem;
        font-weight: 500;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        transition: background-color 0.3s, box-shadow 0.3s;
      }

      .status-detail {
        font-size: 0.7rem;
        color: #666;
        margin-left: 0.25rem;
      }

      /* Status OK */
      .status-ok .status-dot {
        background: #22c55e;
        box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
      }

      .status-ok .status-label {
        color: #22c55e;
      }

      /* Status Degraded */
      .status-degraded .status-dot {
        background: #f59e0b;
        box-shadow: 0 0 6px rgba(245, 158, 11, 0.5);
        animation: pulse-degraded 2s infinite;
      }

      .status-degraded .status-label {
        color: #f59e0b;
      }

      @keyframes pulse-degraded {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }

      /* Status Error */
      .status-error .status-dot {
        background: #ef4444;
        box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
        animation: pulse-error 1s infinite;
      }

      .status-error .status-label {
        color: #ef4444;
      }

      @keyframes pulse-error {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      /* Status Offline */
      .status-offline .status-dot {
        background: #555;
        box-shadow: none;
      }

      .status-offline .status-label {
        color: #555;
      }

      .status-offline .status-icon {
        opacity: 0.5;
      }
    `;
    document.head.appendChild(styles);
  }
}
