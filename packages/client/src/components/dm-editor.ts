/**
 * DM Editor Component
 *
 * Main content editor for reviewing and editing AI-generated content.
 */

import type { GameStateManager } from '../state/game-state.js';
import type { ClientGameState } from '../state/types.js';

export interface DMEditorConfig {
  containerId: string;
}

/**
 * DM Editor component for reviewing and editing AI-generated content
 */
export class DMEditor {
  private container: HTMLElement;
  private state: GameStateManager;
  private textarea: HTMLTextAreaElement | null = null;
  private originalContent: string = '';
  private isEditing: boolean = false;
  private unsubscribe: (() => void) | null = null;

  constructor(config: DMEditorConfig, state: GameStateManager) {
    const container = document.getElementById(config.containerId);
    if (!container) {
      throw new Error(`Container element #${config.containerId} not found`);
    }
    this.container = container;
    this.state = state;
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
      <div class="dm-editor" role="region" aria-label="DM Editor - AI content review and editing">
        <div class="dm-editor-header">
          <span class="dm-editor-title">DM Editor</span>
          <span class="dm-editor-status" role="status" aria-live="polite">Idle</span>
        </div>
        <div class="dm-editor-content">
          <textarea
            class="dm-editor-textarea"
            role="textbox"
            aria-label="AI-generated content editor"
            aria-multiline="true"
            placeholder="AI will generate content here..."></textarea>
          <div class="dm-editor-loading" role="alert" aria-live="assertive" style="display: none;">
            <span class="spinner" aria-hidden="true"></span>
            <span>Generating...</span>
          </div>
        </div>
        <div class="dm-editor-meta" aria-label="Content metadata">
          <span class="event-type-badge"></span>
          <span class="speaker"></span>
        </div>
      </div>
    `;

    this.textarea = this.container.querySelector('.dm-editor-textarea');

    // Set up textarea event listener
    if (this.textarea) {
      this.textarea.addEventListener('input', () => {
        this.isEditing = true;
      });
    }

    // Subscribe to state changes
    this.unsubscribe = this.state.subscribe((state) => this.update(state));

    // Initial update
    this.update(this.state.getState());
  }

  /**
   * Update from state
   */
  update(state: ClientGameState): void {
    const statusEl = this.container.querySelector('.dm-editor-status');
    const loadingEl = this.container.querySelector('.dm-editor-loading') as HTMLElement;
    const eventBadge = this.container.querySelector('.event-type-badge');
    const speakerEl = this.container.querySelector('.speaker');

    // Update status
    if (statusEl) {
      const status = state.editorState?.status ?? 'idle';
      statusEl.textContent = this.formatStatus(status);
      statusEl.className = `dm-editor-status status-${status}`;
    }

    // Update loading state
    if (loadingEl && this.textarea) {
      const isGenerating = state.editorState?.status === 'generating' || state.isLoading;
      loadingEl.style.display = isGenerating ? 'flex' : 'none';
      this.textarea.style.display = isGenerating ? 'none' : 'block';
      // Update aria-busy to indicate loading state to screen readers
      this.textarea.setAttribute('aria-busy', isGenerating ? 'true' : 'false');
    }

    // Update content (only if not actively editing)
    if (this.textarea && !this.isEditing) {
      const content = state.editorState?.editedContent ?? state.editorState?.pending ?? '';
      if (this.textarea.value !== content) {
        this.textarea.value = content;
        this.originalContent = content;
      }
    }

    // Update metadata badge
    if (eventBadge && state.pendingContent) {
      eventBadge.textContent = state.pendingContent.eventType;
      (eventBadge as HTMLElement).style.display = 'inline-block';
    } else if (eventBadge) {
      (eventBadge as HTMLElement).style.display = 'none';
    }

    // Update speaker
    if (speakerEl && state.pendingContent?.metadata?.speaker) {
      speakerEl.textContent = state.pendingContent.metadata.speaker;
      (speakerEl as HTMLElement).style.display = 'inline-block';
    } else if (speakerEl) {
      (speakerEl as HTMLElement).style.display = 'none';
    }
  }

  /**
   * Get current edited content
   */
  getContent(): string {
    return this.textarea?.value ?? '';
  }

  /**
   * Check if content was modified
   */
  isModified(): boolean {
    return this.textarea?.value !== this.originalContent;
  }

  /**
   * Enable/disable editing
   */
  setEnabled(enabled: boolean): void {
    if (this.textarea) {
      this.textarea.disabled = !enabled;
    }
  }

  /**
   * Show loading state
   */
  setLoading(loading: boolean): void {
    const loadingEl = this.container.querySelector('.dm-editor-loading') as HTMLElement;
    if (loadingEl && this.textarea) {
      loadingEl.style.display = loading ? 'flex' : 'none';
      this.textarea.style.display = loading ? 'none' : 'block';
    }
  }

  /**
   * Reset editing state (call after submitting)
   */
  resetEditingState(): void {
    this.isEditing = false;
    this.originalContent = this.textarea?.value ?? '';
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.container.innerHTML = '';
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private formatStatus(status: string): string {
    switch (status) {
      case 'idle':
        return 'Idle';
      case 'generating':
        return 'Generating...';
      case 'editing':
        return 'Reviewing';
      case 'accepting':
        return 'Accepting...';
      default:
        return status;
    }
  }

  private injectStyles(): void {
    if (document.getElementById('dm-editor-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'dm-editor-styles';
    styles.textContent = `
      .dm-editor {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #0a0a0a;
        border: 1px solid #333;
        border-radius: 8px;
        overflow: hidden;
      }

      .dm-editor-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1rem;
        background: #111;
        border-bottom: 1px solid #333;
      }

      .dm-editor-title {
        font-weight: 600;
        color: #e0e0e0;
        font-size: 0.9rem;
      }

      .dm-editor-status {
        font-size: 0.8rem;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        background: #222;
        color: #888;
      }

      .dm-editor-status.status-generating {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        animation: pulse 1.5s infinite;
      }

      .dm-editor-status.status-editing {
        background: #16a34a;
        color: white;
      }

      .dm-editor-status.status-accepting {
        background: #667eea;
        color: white;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }

      .dm-editor-content {
        flex: 1;
        position: relative;
        min-height: 200px;
      }

      .dm-editor-textarea {
        width: 100%;
        height: 100%;
        padding: 1rem;
        background: #0a0a0a;
        border: none;
        color: #e0e0e0;
        font-family: inherit;
        font-size: 1rem;
        line-height: 1.6;
        resize: none;
        outline: none;
      }

      .dm-editor-textarea::placeholder {
        color: #555;
      }

      .dm-editor-textarea:focus {
        background: #0f0f0f;
      }

      .dm-editor-textarea:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .dm-editor-loading {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        background: #0a0a0a;
        color: #888;
      }

      .dm-editor-loading .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid #333;
        border-top-color: #667eea;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .dm-editor-meta {
        display: flex;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        background: #111;
        border-top: 1px solid #333;
        min-height: 2rem;
      }

      .event-type-badge {
        display: none;
        font-size: 0.75rem;
        padding: 0.2rem 0.5rem;
        background: #222;
        border: 1px solid #444;
        border-radius: 4px;
        color: #888;
        text-transform: lowercase;
      }

      .dm-editor-meta .speaker {
        display: none;
        font-size: 0.8rem;
        color: #667eea;
        font-style: italic;
      }
    `;
    document.head.appendChild(styles);
  }
}
