/**
 * Party View Preview Component
 *
 * A small preview pane showing what the Party View will see.
 * Displays filtered content (no DM notes, no hidden traits) using
 * the shared display components.
 */

import type { GameStateManager } from '../state/index.js';
import type { NarrativeEntry } from '../state/types.js';
import { NarrationDisplay } from '../components/shared/index.js';

/**
 * Configuration for Party View Preview
 */
export interface PartyViewPreviewConfig {
  containerId: string;
}

/**
 * Party View Preview - Shows what players will see
 */
export class PartyViewPreview {
  private container: HTMLElement | null;
  private stateManager: GameStateManager;
  private narrationDisplay: NarrationDisplay | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(config: PartyViewPreviewConfig, stateManager: GameStateManager) {
    this.container = document.getElementById(config.containerId);
    this.stateManager = stateManager;
    this.injectStyles();
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Render the preview component
   */
  render(): void {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="party-view-preview">
        <div class="preview-header">
          <span class="preview-label">Party View Preview</span>
          <span class="preview-hint">What players will see (no DM notes or hidden traits)</span>
        </div>
        <div class="preview-content">
          <div class="preview-narration"></div>
        </div>
      </div>
    `;

    // Initialize narration display in the preview
    const narrationContainer = this.container.querySelector('.preview-narration') as HTMLElement;
    if (narrationContainer) {
      this.narrationDisplay = new NarrationDisplay(narrationContainer, {
        title: 'Story',
        showAutoScrollToggle: false,
      });
      this.narrationDisplay.render();
    }

    // Subscribe to state changes
    this.setupStateSubscription();
  }

  /**
   * Destroy the component and cleanup
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.narrationDisplay?.destroy();
    this.narrationDisplay = null;

    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private setupStateSubscription(): void {
    this.unsubscribe = this.stateManager.subscribe((state) => {
      // Filter narrative history to remove DM notes
      const filteredHistory = this.filterForPartyView(state.narrativeHistory);
      this.narrationDisplay?.update(filteredHistory);
    });
  }

  /**
   * Filter narrative entries for party view
   * Removes DM notes and other DM-only content
   */
  private filterForPartyView(entries: NarrativeEntry[]): NarrativeEntry[] {
    return entries.filter((entry) => {
      // Remove DM notes
      if (entry.type === 'dm_note') {
        return false;
      }

      // Could add more filtering here:
      // - Remove entries about hidden traits
      // - Remove spoiler content
      // - etc.

      return true;
    });
  }

  private injectStyles(): void {
    if (document.getElementById('party-view-preview-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'party-view-preview-styles';
    styles.textContent = `
      .party-view-preview {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #0a0a0a;
        border-radius: 8px;
        overflow: hidden;
      }

      .preview-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem 1rem;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-bottom: 1px solid #333;
      }

      .preview-label {
        font-weight: 600;
        font-size: 0.85rem;
        color: #667eea;
      }

      .preview-hint {
        font-size: 0.75rem;
        color: #666;
        font-style: italic;
      }

      .preview-content {
        flex: 1;
        display: flex;
        overflow: hidden;
        padding: 0.5rem;
        gap: 0.5rem;
      }

      .preview-narration {
        flex: 1;
        overflow: hidden;
      }

      /* Compact styling for preview */
      .party-view-preview .narration-display {
        background: transparent;
        border: 1px solid #222;
      }

      .party-view-preview .narration-header {
        padding: 0.5rem 0.75rem;
        font-size: 0.8rem;
      }

      .party-view-preview .narration-entries {
        padding: 0.5rem;
        gap: 0.5rem;
      }

      .party-view-preview .narrative-entry {
        padding: 0.5rem;
        font-size: 0.85rem;
        line-height: 1.4;
      }
    `;
    document.head.appendChild(styles);
  }
}

export default PartyViewPreview;
