/**
 * Speech Bubble Component
 *
 * Displays speech bubbles next to character avatars during TTS playback.
 * Shows during TTS, fades after completion, and supports click to replay.
 */

export interface SpeechBubbleConfig {
  /** Duration in ms before auto-fade after TTS ends (default: 3000) */
  fadeDelay?: number;
  /** Duration of fade animation in ms (default: 500) */
  fadeDuration?: number;
}

export interface SpeechBubbleCallbacks {
  /** Called when the bubble is clicked for replay */
  onReplayClick?: (characterId: string, text: string) => void;
}

interface ActiveBubble {
  element: HTMLElement;
  characterId: string;
  text: string;
  fadeTimeout: ReturnType<typeof setTimeout> | null;
}

/**
 * Speech Bubble manager for displaying character speech during TTS
 */
export class SpeechBubble {
  private readonly fadeDelay: number;
  private readonly fadeDuration: number;
  private callbacks: SpeechBubbleCallbacks = {};
  private activeBubbles: Map<string, ActiveBubble> = new Map();

  constructor(config: SpeechBubbleConfig = {}) {
    this.fadeDelay = config.fadeDelay ?? 3000;
    this.fadeDuration = config.fadeDuration ?? 500;
    this.injectStyles();
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Show a speech bubble for a character
   * @param characterId - The ID of the character (matches data-character-id)
   * @param text - The text to display in the bubble
   */
  show(characterId: string, text: string): void {
    // Remove existing bubble for this character if any
    this.hide(characterId);

    const characterCard = document.querySelector(
      `[data-character-id="${characterId}"]`
    );
    if (!characterCard) {
      console.warn(`Character card not found for ID: ${characterId}`);
      return;
    }

    // Create bubble element
    const bubble = this.createBubbleElement(characterId, text);

    // Position relative to character card
    const cardRect = characterCard.getBoundingClientRect();
    const avatar = characterCard.querySelector('.character-avatar');
    const avatarRect = avatar?.getBoundingClientRect() ?? cardRect;

    // Append to body for proper positioning
    document.body.appendChild(bubble);

    // Position bubble above the avatar
    this.positionBubble(bubble, avatarRect);

    // Store reference
    this.activeBubbles.set(characterId, {
      element: bubble,
      characterId,
      text,
      fadeTimeout: null,
    });

    // Trigger entrance animation
    requestAnimationFrame(() => {
      bubble.classList.add('speech-bubble-visible');
    });
  }

  /**
   * Hide and fade out the speech bubble for a character
   * @param characterId - The ID of the character
   * @param immediate - If true, hide immediately without fade
   */
  hide(characterId: string, immediate = false): void {
    const bubble = this.activeBubbles.get(characterId);
    if (!bubble) return;

    // Clear any pending fade timeout
    if (bubble.fadeTimeout) {
      clearTimeout(bubble.fadeTimeout);
      bubble.fadeTimeout = null;
    }

    if (immediate) {
      this.removeBubble(characterId);
    } else {
      // Start fade animation
      bubble.element.classList.remove('speech-bubble-visible');
      bubble.element.classList.add('speech-bubble-fading');

      // Remove after fade completes
      setTimeout(() => {
        this.removeBubble(characterId);
      }, this.fadeDuration);
    }
  }

  /**
   * Schedule a bubble to fade after a delay (called when TTS ends)
   * @param characterId - The ID of the character
   */
  scheduleFade(characterId: string): void {
    const bubble = this.activeBubbles.get(characterId);
    if (!bubble) return;

    // Clear existing timeout if any
    if (bubble.fadeTimeout) {
      clearTimeout(bubble.fadeTimeout);
    }

    // Schedule fade
    bubble.fadeTimeout = setTimeout(() => {
      this.hide(characterId);
    }, this.fadeDelay);
  }

  /**
   * Hide all active bubbles
   * @param immediate - If true, hide immediately without fade
   */
  hideAll(immediate = false): void {
    for (const characterId of this.activeBubbles.keys()) {
      this.hide(characterId, immediate);
    }
  }

  /**
   * Set callbacks for bubble events
   */
  setCallbacks(callbacks: SpeechBubbleCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Check if a character has an active bubble
   */
  isActive(characterId: string): boolean {
    return this.activeBubbles.has(characterId);
  }

  /**
   * Get the text of an active bubble
   */
  getText(characterId: string): string | undefined {
    return this.activeBubbles.get(characterId)?.text;
  }

  /**
   * Cleanup all bubbles and resources
   */
  destroy(): void {
    this.hideAll(true);
    this.callbacks = {};
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private createBubbleElement(characterId: string, text: string): HTMLElement {
    const bubble = document.createElement('div');
    bubble.className = 'speech-bubble';
    bubble.setAttribute('data-character-id', characterId);

    // Truncate very long text
    const displayText = text.length > 150 ? text.slice(0, 147) + '...' : text;

    bubble.innerHTML = `
      <div class="speech-bubble-content">
        <span class="speech-bubble-text">${this.escapeHtml(displayText)}</span>
      </div>
      <div class="speech-bubble-tail"></div>
    `;

    // Add click handler for replay
    bubble.addEventListener('click', () => {
      this.callbacks.onReplayClick?.(characterId, text);
    });

    return bubble;
  }

  private positionBubble(bubble: HTMLElement, avatarRect: DOMRect): void {
    // Position above and slightly to the right of the avatar
    const bubbleWidth = 200; // Approximate width
    const gap = 8;

    const left = avatarRect.left + avatarRect.width / 2 - bubbleWidth / 2;
    const top = avatarRect.top - gap;

    bubble.style.left = `${Math.max(8, left)}px`;
    bubble.style.top = `${top}px`;
    bubble.style.transform = 'translateY(-100%)';
  }

  private removeBubble(characterId: string): void {
    const bubble = this.activeBubbles.get(characterId);
    if (!bubble) return;

    if (bubble.fadeTimeout) {
      clearTimeout(bubble.fadeTimeout);
    }

    bubble.element.remove();
    this.activeBubbles.delete(characterId);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private injectStyles(): void {
    if (document.getElementById('speech-bubble-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'speech-bubble-styles';
    styles.textContent = `
      .speech-bubble {
        position: fixed;
        z-index: 1000;
        max-width: 250px;
        min-width: 100px;
        opacity: 0;
        transform: translateY(-100%) scale(0.9);
        transition: opacity ${this.fadeDuration}ms ease, transform ${this.fadeDuration}ms ease;
        pointer-events: auto;
        cursor: pointer;
      }

      .speech-bubble-visible {
        opacity: 1;
        transform: translateY(-100%) scale(1);
      }

      .speech-bubble-fading {
        opacity: 0;
        transform: translateY(-100%) scale(0.9);
      }

      .speech-bubble-content {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 12px;
        padding: 0.75rem 1rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        position: relative;
      }

      .speech-bubble-content::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 12px;
        padding: 1px;
        background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.05) 100%);
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        pointer-events: none;
      }

      .speech-bubble-text {
        color: #fff;
        font-size: 0.85rem;
        line-height: 1.4;
        display: block;
        word-wrap: break-word;
      }

      .speech-bubble-tail {
        position: absolute;
        bottom: -8px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 10px solid transparent;
        border-right: 10px solid transparent;
        border-top: 10px solid #764ba2;
      }

      .speech-bubble:hover .speech-bubble-content {
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
      }

      .speech-bubble:hover::after {
        content: 'Click to replay';
        position: absolute;
        bottom: -24px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 0.7rem;
        color: #888;
        white-space: nowrap;
      }

      /* Pulsing animation while speaking */
      .speech-bubble-speaking .speech-bubble-content {
        animation: speech-pulse 1.5s ease-in-out infinite;
      }

      @keyframes speech-pulse {
        0%, 100% {
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }
        50% {
          box-shadow: 0 4px 20px rgba(102, 126, 234, 0.5);
        }
      }
    `;
    document.head.appendChild(styles);
  }
}
