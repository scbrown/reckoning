/**
 * Narration Display Component
 *
 * View-agnostic scrolling narrative history display.
 * Receives filtered narrative entries from the view layer.
 */

import type { NarrativeEntry } from '../../state/types.js';

/**
 * Configuration for NarrationDisplay
 */
export interface NarrationDisplayConfig {
  /** Optional header title (default: 'Narrative') */
  title?: string;
  /** Enable auto-scroll toggle (default: true) */
  showAutoScrollToggle?: boolean;
}

/**
 * Narration Display component for displaying narrative history
 *
 * This is a view-agnostic component that receives filtered narrative entries
 * from the view layer rather than subscribing to global state directly.
 */
export class NarrationDisplay {
  private container: HTMLElement;
  private entries: HTMLElement | null = null;
  private autoScroll: boolean = true;
  private lastEntryCount: number = 0;
  private readonly title: string;
  private readonly showAutoScrollToggle: boolean;

  /**
   * Create a new NarrationDisplay
   *
   * @param container - The container element to render into
   * @param config - Configuration options
   */
  constructor(container: HTMLElement, config: NarrationDisplayConfig = {}) {
    this.container = container;
    this.title = config.title ?? 'Narrative';
    this.showAutoScrollToggle = config.showAutoScrollToggle !== false;
    this.injectStyles();
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Render the component structure
   */
  render(): void {
    this.container.innerHTML = `
      <div class="narration-display">
        <div class="narration-header">
          <span>${this.escapeHtml(this.title)}</span>
          ${this.showAutoScrollToggle ? `
            <label class="auto-scroll-toggle">
              <input type="checkbox" checked />
              <span>Auto-scroll</span>
            </label>
          ` : ''}
        </div>
        <div class="narration-entries" role="log" aria-live="polite" aria-label="Narrative history"></div>
      </div>
    `;

    this.entries = this.container.querySelector('.narration-entries');

    // Set up auto-scroll toggle
    if (this.showAutoScrollToggle) {
      const checkbox = this.container.querySelector('.auto-scroll-toggle input') as HTMLInputElement;
      if (checkbox) {
        checkbox.addEventListener('change', () => {
          this.autoScroll = checkbox.checked;
          if (this.autoScroll) {
            this.scrollToBottom();
          }
        });
      }
    }
  }

  /**
   * Update the display with narrative entries
   *
   * @param narrativeHistory - Array of narrative entries to display
   */
  update(narrativeHistory: NarrativeEntry[]): void {
    if (!this.entries) return;

    // Only re-render if entries changed
    if (narrativeHistory.length !== this.lastEntryCount) {
      this.entries.innerHTML = narrativeHistory
        .map((entry) => this.renderEntry(entry))
        .join('');
      this.lastEntryCount = narrativeHistory.length;

      if (this.autoScroll) {
        this.scrollToBottom();
      }
    } else {
      // Just update TTS indicators
      narrativeHistory.forEach((entry) => {
        const ttsIndicator = this.entries?.querySelector(`[data-entry-id="${entry.id}"] .tts-indicator`);
        if (ttsIndicator) {
          ttsIndicator.className = `tts-indicator ${entry.isTTSPlaying ? 'playing' : ''}`;
          ttsIndicator.textContent = entry.isTTSPlaying ? '🔊' : '';
        }
      });
    }
  }

  /**
   * Add a new narrative entry
   */
  addEntry(entry: NarrativeEntry): void {
    if (!this.entries) return;

    const entryHtml = this.renderEntry(entry);
    this.entries.insertAdjacentHTML('beforeend', entryHtml);
    this.lastEntryCount++;

    if (this.autoScroll) {
      this.scrollToBottom();
    }
  }

  /**
   * Scroll to bottom
   */
  scrollToBottom(): void {
    if (this.entries) {
      this.entries.scrollTop = this.entries.scrollHeight;
    }
  }

  /**
   * Toggle auto-scroll
   */
  setAutoScroll(enabled: boolean): void {
    this.autoScroll = enabled;
    const checkbox = this.container.querySelector('.auto-scroll-toggle input') as HTMLInputElement;
    if (checkbox) {
      checkbox.checked = enabled;
    }
    if (enabled) {
      this.scrollToBottom();
    }
  }

  /**
   * Get auto-scroll state
   */
  getAutoScroll(): boolean {
    return this.autoScroll;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    if (this.entries) {
      this.entries.innerHTML = '';
      this.lastEntryCount = 0;
    }
  }

  /**
   * Get the container element
   */
  getElement(): HTMLElement {
    return this.container;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.container.innerHTML = '';
    this.entries = null;
    this.lastEntryCount = 0;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private renderEntry(entry: NarrativeEntry): string {
    const typeClass = this.getTypeClass(entry.type);
    const hasSpeaker = entry.speaker && this.isDialogueType(entry.type);

    return `
      <div class="narrative-entry ${typeClass}" data-entry-id="${entry.id}" role="article">
        ${hasSpeaker ? `<span class="entry-speaker">${this.escapeHtml(entry.speaker!)}:</span>` : ''}
        <span class="entry-content">${this.escapeHtml(entry.content)}</span>
        <span class="tts-indicator ${entry.isTTSPlaying ? 'playing' : ''}" aria-hidden="true">${entry.isTTSPlaying ? '🔊' : ''}</span>
      </div>
    `;
  }

  private getTypeClass(type: string): string {
    // Map event types to CSS classes
    switch (type) {
      case 'narration':
        return 'narration';
      case 'party_dialogue':
      case 'party_action':
        return 'party_dialogue';
      case 'npc_dialogue':
      case 'npc_action':
        return 'npc_dialogue';
      case 'dm_note':
        return 'dm_note';
      default:
        return 'narration';
    }
  }

  private isDialogueType(type: string): boolean {
    return ['party_dialogue', 'npc_dialogue'].includes(type);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private injectStyles(): void {
    if (document.getElementById('narration-display-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'narration-display-styles';
    styles.textContent = `
      .narration-display {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #0a0a0a;
        border: 1px solid #333;
        border-radius: 8px;
        overflow: hidden;
      }

      .narration-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1rem;
        background: #111;
        border-bottom: 1px solid #333;
        font-weight: 600;
        color: #e0e0e0;
        font-size: 0.9rem;
      }

      .auto-scroll-toggle {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.8rem;
        font-weight: normal;
        color: #888;
        cursor: pointer;
      }

      .auto-scroll-toggle input {
        cursor: pointer;
        accent-color: #667eea;
      }

      .narration-entries {
        flex: 1;
        overflow-y: auto;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .narration-entries::-webkit-scrollbar {
        width: 8px;
      }

      .narration-entries::-webkit-scrollbar-track {
        background: #111;
      }

      .narration-entries::-webkit-scrollbar-thumb {
        background: #333;
        border-radius: 4px;
      }

      .narration-entries::-webkit-scrollbar-thumb:hover {
        background: #444;
      }

      .narrative-entry {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: baseline;
        padding: 0.75rem;
        background: #111;
        border-radius: 4px;
        border-left: 3px solid #333;
        line-height: 1.5;
      }

      .narrative-entry.narration {
        border-left-color: #667eea;
        color: #e0e0e0;
        font-style: italic;
      }

      .narrative-entry.party_dialogue {
        border-left-color: #16a34a;
        color: #e0e0e0;
      }

      .narrative-entry.npc_dialogue {
        border-left-color: #dc2626;
        color: #e0e0e0;
      }

      .narrative-entry.dm_note {
        border-left-color: #764ba2;
        color: #888;
        background: #0f0f0f;
        font-size: 0.9rem;
      }

      .entry-speaker {
        font-weight: 600;
        color: #667eea;
      }

      .narrative-entry.party_dialogue .entry-speaker {
        color: #22c55e;
      }

      .narrative-entry.npc_dialogue .entry-speaker {
        color: #f87171;
      }

      .entry-content {
        flex: 1;
      }

      .tts-indicator {
        font-size: 1rem;
        min-width: 1.5rem;
        text-align: center;
      }

      .tts-indicator.playing {
        animation: pulse-tts 1s infinite;
      }

      @keyframes pulse-tts {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    `;
    document.head.appendChild(styles);
  }
}

export default NarrationDisplay;
