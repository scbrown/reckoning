/**
 * Controls Component
 *
 * Action buttons for DM decisions: Accept/Edit/Regenerate/Inject
 */

export interface ControlsConfig {
  containerId: string;
}

export interface ControlsCallbacks {
  onAccept: () => void;
  onEdit: () => void;
  onRegenerate: (feedback?: string) => void;
  onInject: () => void;
}

type ControlButton = 'accept' | 'edit' | 'regenerate' | 'inject';

/**
 * Controls component for DM action buttons
 */
export class Controls {
  private container: HTMLElement;
  private callbacks: ControlsCallbacks;

  constructor(config: ControlsConfig, callbacks: ControlsCallbacks) {
    const container = document.getElementById(config.containerId);
    if (!container) {
      throw new Error(`Container element #${config.containerId} not found`);
    }
    this.container = container;
    this.callbacks = callbacks;
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
      <div class="controls-wrapper">
        <div class="controls" role="toolbar" aria-label="DM action controls">
          <button
            class="btn btn-accept"
            title="Submit as-is"
            aria-label="Accept content as-is"
            data-control="accept"
            tabindex="0"
          >Accept</button>
          <button
            class="btn btn-edit"
            title="Edit and submit"
            aria-label="Edit content before submitting"
            data-control="edit"
            tabindex="-1"
          >Edit</button>
          <button
            class="btn btn-regenerate"
            title="Ask AI to try again"
            aria-label="Regenerate content with AI"
            data-control="regenerate"
            tabindex="-1"
          >Regenerate</button>
          <button
            class="btn btn-inject"
            title="Write your own"
            aria-label="Inject your own content"
            data-control="inject"
            tabindex="-1"
          >Inject</button>
        </div>
        <div class="regenerate-feedback" style="display: none;" role="group" aria-label="Regeneration feedback">
          <input
            type="text"
            placeholder="Feedback for AI (optional)..."
            aria-label="Feedback for AI regeneration"
          />
          <button class="btn-small" aria-label="Submit regeneration request">Submit</button>
          <button class="btn-small btn-cancel" aria-label="Cancel regeneration">Cancel</button>
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.attachKeyboardNavigation();
  }

  /**
   * Enable/disable specific button
   */
  setEnabled(button: ControlButton, enabled: boolean): void {
    const btn = this.container.querySelector(`.btn-${button}`) as HTMLButtonElement;
    if (btn) {
      btn.disabled = !enabled;
    }
  }

  /**
   * Set all buttons enabled/disabled
   */
  setAllEnabled(enabled: boolean): void {
    const buttons = this.container.querySelectorAll('.controls .btn') as NodeListOf<HTMLButtonElement>;
    buttons.forEach((btn) => {
      btn.disabled = !enabled;
    });
  }

  /**
   * Show regenerate feedback input
   */
  showRegenerateFeedback(): void {
    const feedbackEl = this.container.querySelector('.regenerate-feedback') as HTMLElement;
    const controlsEl = this.container.querySelector('.controls') as HTMLElement;
    if (feedbackEl && controlsEl) {
      feedbackEl.style.display = 'flex';
      controlsEl.style.display = 'none';

      // Focus the input
      const input = feedbackEl.querySelector('input') as HTMLInputElement;
      if (input) {
        input.value = '';
        input.focus();
      }
    }
  }

  /**
   * Hide regenerate feedback input
   */
  hideRegenerateFeedback(): void {
    const feedbackEl = this.container.querySelector('.regenerate-feedback') as HTMLElement;
    const controlsEl = this.container.querySelector('.controls') as HTMLElement;
    if (feedbackEl && controlsEl) {
      feedbackEl.style.display = 'none';
      controlsEl.style.display = 'flex';
    }
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
    // Accept button
    const acceptBtn = this.container.querySelector('.btn-accept');
    acceptBtn?.addEventListener('click', () => this.callbacks.onAccept());

    // Edit button
    const editBtn = this.container.querySelector('.btn-edit');
    editBtn?.addEventListener('click', () => this.callbacks.onEdit());

    // Regenerate button - shows feedback input
    const regenerateBtn = this.container.querySelector('.btn-regenerate');
    regenerateBtn?.addEventListener('click', () => this.showRegenerateFeedback());

    // Inject button
    const injectBtn = this.container.querySelector('.btn-inject');
    injectBtn?.addEventListener('click', () => this.callbacks.onInject());

    // Feedback submit
    const feedbackEl = this.container.querySelector('.regenerate-feedback');
    const feedbackInput = feedbackEl?.querySelector('input') as HTMLInputElement;
    const feedbackSubmit = feedbackEl?.querySelector('.btn-small:not(.btn-cancel)');
    const feedbackCancel = feedbackEl?.querySelector('.btn-cancel');

    feedbackSubmit?.addEventListener('click', () => {
      const feedback = feedbackInput?.value.trim() || undefined;
      this.callbacks.onRegenerate(feedback);
      this.hideRegenerateFeedback();
    });

    feedbackCancel?.addEventListener('click', () => {
      this.hideRegenerateFeedback();
    });

    feedbackInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const feedback = feedbackInput.value.trim() || undefined;
        this.callbacks.onRegenerate(feedback);
        this.hideRegenerateFeedback();
      } else if (e.key === 'Escape') {
        this.hideRegenerateFeedback();
      }
    });
  }

  /**
   * Set up keyboard navigation for toolbar (arrow keys)
   */
  private attachKeyboardNavigation(): void {
    const toolbar = this.container.querySelector('.controls[role="toolbar"]');
    if (!toolbar) return;

    const buttons = Array.from(toolbar.querySelectorAll('.btn')) as HTMLButtonElement[];
    if (buttons.length === 0) return;

    toolbar.addEventListener('keydown', (e) => {
      const event = e as KeyboardEvent;
      const currentButton = document.activeElement as HTMLButtonElement;
      const currentIndex = buttons.indexOf(currentButton);

      if (currentIndex === -1) return;

      let nextIndex: number | null = null;

      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          // Move to next button, wrap around
          nextIndex = (currentIndex + 1) % buttons.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          // Move to previous button, wrap around
          nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
          break;
        case 'Home':
          // Move to first button
          nextIndex = 0;
          break;
        case 'End':
          // Move to last button
          nextIndex = buttons.length - 1;
          break;
      }

      if (nextIndex !== null) {
        const targetButton = buttons[nextIndex];
        if (targetButton) {
          event.preventDefault();
          // Update tabindex for roving tabindex pattern
          buttons.forEach((btn, i) => {
            btn.tabIndex = i === nextIndex ? 0 : -1;
          });
          targetButton.focus();
        }
      }
    });
  }

  private injectStyles(): void {
    if (document.getElementById('controls-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'controls-styles';
    styles.textContent = `
      .controls-wrapper {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .controls {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }

      .controls .btn {
        flex: 1;
        min-width: 100px;
        padding: 0.75rem 1rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.9rem;
        font-weight: 500;
        transition: all 0.2s;
      }

      .controls .btn:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      }

      .controls .btn:active:not(:disabled) {
        transform: translateY(0);
      }

      .controls .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .controls .btn:focus {
        outline: 2px solid #667eea;
        outline-offset: 2px;
      }

      .controls .btn:focus:not(:focus-visible) {
        outline: none;
      }

      .controls .btn:focus-visible {
        outline: 2px solid #667eea;
        outline-offset: 2px;
      }

      .controls .btn-accept {
        background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%);
        color: white;
      }

      .controls .btn-edit {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }

      .controls .btn-regenerate {
        background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);
        color: #1a1a1a;
      }

      .controls .btn-inject {
        background: linear-gradient(135deg, #dc2626 0%, #f87171 100%);
        color: white;
      }

      .regenerate-feedback {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        padding: 0.75rem;
        background: #111;
        border: 1px solid #333;
        border-radius: 4px;
      }

      .regenerate-feedback input {
        flex: 1;
        padding: 0.5rem 0.75rem;
        background: #222;
        border: 1px solid #444;
        border-radius: 4px;
        color: #e0e0e0;
        font-size: 0.9rem;
      }

      .regenerate-feedback input:focus {
        outline: none;
        border-color: #667eea;
      }

      .regenerate-feedback .btn-small {
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.85rem;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        transition: opacity 0.2s;
      }

      .regenerate-feedback .btn-small:hover {
        opacity: 0.9;
      }

      .regenerate-feedback .btn-cancel {
        background: #333;
        color: #888;
      }
    `;
    document.head.appendChild(styles);
  }
}
