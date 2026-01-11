/**
 * Game Stats Component
 *
 * Displays game statistics: turn count, events, and session duration.
 */

import type { GameObservation } from '@reckoning/shared';

export interface GameStatsConfig {
  containerId: string;
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  } else if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Game Stats component for displaying game metrics
 */
export class GameStats {
  private container: HTMLElement;
  private sessionStartTime: number;
  private updateInterval: number | null = null;

  constructor(config: GameStatsConfig) {
    const container = document.getElementById(config.containerId);
    if (!container) {
      throw new Error(`Container element #${config.containerId} not found`);
    }
    this.container = container;
    this.sessionStartTime = Date.now();
    this.injectStyles();
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Render the component with initial empty state
   */
  render(): void {
    this.container.innerHTML = `
      <div class="game-stats">
        <div class="stat-item">
          <span class="stat-icon">⏱</span>
          <span class="stat-value" data-stat="turn">0</span>
          <span class="stat-label">Turn</span>
        </div>
        <div class="stat-item">
          <span class="stat-icon">📜</span>
          <span class="stat-value" data-stat="events">0</span>
          <span class="stat-label">Events</span>
        </div>
        <div class="stat-item">
          <span class="stat-icon">⏳</span>
          <span class="stat-value" data-stat="duration">0s</span>
          <span class="stat-label">Duration</span>
        </div>
      </div>
    `;

    // Start duration update interval
    this.startDurationUpdates();
  }

  /**
   * Update displayed stats from game observation
   */
  update(observation: Partial<GameObservation>): void {
    if (observation.turn !== undefined) {
      this.setStatValue('turn', String(observation.turn));
    }
    if (observation.totalEvents !== undefined) {
      this.setStatValue('events', String(observation.totalEvents));
    }
    if (observation.sessionDuration !== undefined) {
      this.setStatValue('duration', formatDuration(observation.sessionDuration));
    }
  }

  /**
   * Reset session start time (call when starting new game)
   */
  resetSession(): void {
    this.sessionStartTime = Date.now();
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopDurationUpdates();
    this.container.innerHTML = '';
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private setStatValue(stat: string, value: string): void {
    const el = this.container.querySelector(`[data-stat="${stat}"]`);
    if (el) {
      el.textContent = value;
    }
  }

  private startDurationUpdates(): void {
    // Update duration every second
    this.updateInterval = window.setInterval(() => {
      const elapsed = Date.now() - this.sessionStartTime;
      this.setStatValue('duration', formatDuration(elapsed));
    }, 1000);
  }

  private stopDurationUpdates(): void {
    if (this.updateInterval !== null) {
      window.clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  private injectStyles(): void {
    if (document.getElementById('game-stats-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'game-stats-styles';
    styles.textContent = `
      .game-stats {
        display: flex;
        gap: 1rem;
        background: #111;
        padding: 0.75rem 1rem;
        border-radius: 8px;
        border: 1px solid #333;
      }

      .stat-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.25rem 0.5rem;
        background: #1a1a1a;
        border-radius: 4px;
        border: 1px solid #2a2a2a;
      }

      .stat-icon {
        font-size: 1rem;
        line-height: 1;
        opacity: 0.8;
      }

      .stat-value {
        font-size: 1rem;
        font-weight: 600;
        color: #e0e0e0;
        font-variant-numeric: tabular-nums;
        min-width: 2rem;
        text-align: center;
      }

      .stat-label {
        font-size: 0.7rem;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      /* Responsive: stack vertically on narrow screens */
      @media (max-width: 480px) {
        .game-stats {
          flex-direction: column;
          gap: 0.5rem;
        }

        .stat-item {
          justify-content: space-between;
        }
      }
    `;
    document.head.appendChild(styles);
  }
}
