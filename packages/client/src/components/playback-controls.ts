/**
 * Playback Controls Component
 *
 * Auto/Pause/Step/Stop playback mode controls.
 */

import type { PlaybackMode } from '@reckoning/shared';

export interface PlaybackControlsConfig {
  containerId: string;
}

/**
 * Playback Controls component for playback mode management
 */
export class PlaybackControls {
  private container: HTMLElement;
  private onModeChange: (mode: PlaybackMode) => void;
  private currentMode: PlaybackMode = 'auto';

  constructor(config: PlaybackControlsConfig, onModeChange: (mode: PlaybackMode) => void) {
    const container = document.getElementById(config.containerId);
    if (!container) {
      throw new Error(`Container element #${config.containerId} not found`);
    }
    this.container = container;
    this.onModeChange = onModeChange;
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
      <div class="playback-controls">
        <button class="btn-playback active" data-mode="auto" title="Auto-advance">
          <span class="playback-icon">▶</span>
          <span class="playback-label">Auto</span>
        </button>
        <button class="btn-playback" data-mode="paused" title="Pause">
          <span class="playback-icon">⏸</span>
          <span class="playback-label">Pause</span>
        </button>
        <button class="btn-playback" data-mode="stepping" title="Step through one at a time">
          <span class="playback-icon">⏭</span>
          <span class="playback-label">Step</span>
        </button>
        <button class="btn-playback" data-mode="stopped" title="Stop completely">
          <span class="playback-icon">⏹</span>
          <span class="playback-label">Stop</span>
        </button>
      </div>
    `;

    this.attachEventListeners();
    this.updateActiveButton();
  }

  /**
   * Update displayed mode
   */
  setMode(mode: PlaybackMode): void {
    this.currentMode = mode;
    this.updateActiveButton();
  }

  /**
   * Get current mode
   */
  getMode(): PlaybackMode {
    return this.currentMode;
  }

  /**
   * Enable/disable controls
   */
  setEnabled(enabled: boolean): void {
    const buttons = this.container.querySelectorAll('.btn-playback') as NodeListOf<HTMLButtonElement>;
    buttons.forEach((btn) => {
      btn.disabled = !enabled;
    });
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

  private attachEventListeners(): void {
    const buttons = this.container.querySelectorAll('.btn-playback');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = (btn as HTMLElement).dataset.mode as PlaybackMode;
        if (mode && mode !== this.currentMode) {
          this.currentMode = mode;
          this.updateActiveButton();
          this.onModeChange(mode);
        }
      });
    });
  }

  private updateActiveButton(): void {
    const buttons = this.container.querySelectorAll('.btn-playback');
    buttons.forEach((btn) => {
      const mode = (btn as HTMLElement).dataset.mode;
      btn.classList.toggle('active', mode === this.currentMode);
    });
  }

  private injectStyles(): void {
    if (document.getElementById('playback-controls-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'playback-controls-styles';
    styles.textContent = `
      .playback-controls {
        display: flex;
        gap: 0.25rem;
        background: #111;
        padding: 0.5rem;
        border-radius: 8px;
        border: 1px solid #333;
      }

      .btn-playback {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
        padding: 0.5rem 0.75rem;
        background: #222;
        border: 1px solid #333;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
        min-width: 60px;
      }

      .btn-playback:hover:not(:disabled) {
        background: #2a2a2a;
        border-color: #444;
      }

      .btn-playback:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .btn-playback.active {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-color: transparent;
      }

      .playback-icon {
        font-size: 1.2rem;
        color: #888;
        line-height: 1;
      }

      .btn-playback.active .playback-icon {
        color: white;
      }

      .playback-label {
        font-size: 0.7rem;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .btn-playback.active .playback-label {
        color: rgba(255, 255, 255, 0.9);
      }

      .btn-playback[data-mode="auto"]:hover:not(:disabled):not(.active) .playback-icon {
        color: #22c55e;
      }

      .btn-playback[data-mode="paused"]:hover:not(:disabled):not(.active) .playback-icon {
        color: #f59e0b;
      }

      .btn-playback[data-mode="stepping"]:hover:not(:disabled):not(.active) .playback-icon {
        color: #667eea;
      }

      .btn-playback[data-mode="stopped"]:hover:not(:disabled):not(.active) .playback-icon {
        color: #dc2626;
      }
    `;
    document.head.appendChild(styles);
  }
}
