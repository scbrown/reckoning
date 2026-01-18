/**
 * Character Card Component
 *
 * Reusable character card for party panel and other contexts.
 * Displays character name, class, avatar, and health bar.
 * Supports animated pixel art avatars via AvatarManager.
 */

import type { Character, CharacterStats } from '@reckoning/shared';

export interface CharacterCardConfig {
  containerId?: string | undefined;
  onClick?: ((character: Character) => void) | undefined;
}

/**
 * Callback for mounting animated avatars after HTML render
 */
export type AvatarMountCallback = (characterId: string, container: HTMLElement) => void;

/**
 * Character Card component for displaying a single character
 */
export class CharacterCard {
  private container: HTMLElement | null = null;
  private character: Character;
  private onClick: ((character: Character) => void) | undefined;

  constructor(character: Character, config: CharacterCardConfig = {}) {
    this.character = character;
    this.onClick = config.onClick;

    if (config.containerId) {
      const container = document.getElementById(config.containerId);
      if (!container) {
        throw new Error(`Container element #${config.containerId} not found`);
      }
      this.container = container;
    }

    this.injectStyles();
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Render the component to its container
   */
  render(): void {
    if (!this.container) {
      throw new Error('Cannot render: no container specified');
    }
    this.container.innerHTML = this.toHTML();
    this.attachEventListeners();
  }

  /**
   * Generate HTML string for the character card
   * Useful for rendering within parent components
   *
   * The avatar container has the class 'avatar-mount' which can be used
   * to mount animated avatars after the HTML is inserted into the DOM.
   */
  toHTML(): string {
    const healthPercent = this.calculateHealthPercent(this.character.stats);
    const healthClass = this.getHealthClass(healthPercent);
    const clickableClass = this.onClick ? 'character-card--clickable' : '';

    return `
      <div class="character-card ${clickableClass}" data-character-id="${this.character.id}">
        <div class="character-avatar">
          <div class="avatar-mount" data-avatar-for="${this.character.id}">
            <div class="avatar-placeholder">${this.getInitials(this.character.name)}</div>
          </div>
        </div>
        <div class="character-info">
          <div class="character-name">${this.escapeHtml(this.character.name)}</div>
          <div class="character-role">${this.escapeHtml(this.character.class)}</div>
          <div class="character-health">
            <div class="health-bar">
              <div class="health-fill ${healthClass}" style="width: ${healthPercent}%"></div>
            </div>
            <span class="health-text">${this.character.stats.health}/${this.character.stats.maxHealth}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Mount an animated avatar element into the card's avatar container.
   * Call this after the card HTML has been rendered to the DOM.
   *
   * @param element - Canvas element from AnimatedAvatar.getElement()
   * @param rootElement - Optional root element to search within (defaults to document)
   * @returns true if mounted successfully, false otherwise
   */
  static mountAvatar(
    characterId: string,
    element: HTMLElement,
    rootElement: Element = document.documentElement
  ): boolean {
    const container = rootElement.querySelector(
      `.avatar-mount[data-avatar-for="${characterId}"]`
    );
    if (!container) {
      console.warn(`CharacterCard: No avatar mount found for character ${characterId}`);
      return false;
    }

    // Clear existing content and insert the animated avatar
    container.innerHTML = '';
    container.appendChild(element);
    return true;
  }

  /**
   * Get all avatar mount containers within a root element
   */
  static getAvatarMounts(rootElement: Element = document.documentElement): NodeListOf<Element> {
    return rootElement.querySelectorAll('.avatar-mount[data-avatar-for]');
  }

  /**
   * Update the displayed character
   */
  setCharacter(character: Character): void {
    this.character = character;
    if (this.container) {
      this.render();
    }
  }

  /**
   * Get current character
   */
  getCharacter(): Character {
    return this.character;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  // ===========================================================================
  // Static Utilities
  // ===========================================================================

  /**
   * Render multiple character cards and return HTML string
   */
  static renderMany(characters: Character[], onClick?: (character: Character) => void): string {
    CharacterCard.injectStylesStatic();
    return characters
      .map((character) => {
        const card = new CharacterCard(character, { onClick });
        return card.toHTML();
      })
      .join('');
  }

  /**
   * Calculate health percentage
   */
  static calculateHealthPercent(stats: CharacterStats): number {
    if (stats.maxHealth <= 0) return 0;
    return Math.min(100, Math.max(0, (stats.health / stats.maxHealth) * 100));
  }

  /**
   * Get health bar CSS class based on percentage
   */
  static getHealthClass(percent: number): string {
    if (percent <= 25) return 'health-critical';
    if (percent <= 50) return 'health-low';
    return 'health-good';
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private calculateHealthPercent(stats: CharacterStats): number {
    return CharacterCard.calculateHealthPercent(stats);
  }

  private getHealthClass(percent: number): string {
    return CharacterCard.getHealthClass(percent);
  }

  private getInitials(name: string): string {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private attachEventListeners(): void {
    if (!this.container || !this.onClick) return;

    const card = this.container.querySelector('.character-card');
    if (card) {
      card.addEventListener('click', () => {
        this.onClick?.(this.character);
      });
    }
  }

  private injectStyles(): void {
    CharacterCard.injectStylesStatic();
  }

  private static injectStylesStatic(): void {
    if (document.getElementById('character-card-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'character-card-styles';
    styles.textContent = `
      .character-card {
        display: flex;
        gap: 0.75rem;
        padding: 0.75rem;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
        transition: all 0.2s;
      }

      .character-card:hover {
        border-color: #444;
        background: #222;
      }

      .character-card--clickable {
        cursor: pointer;
      }

      .character-card--clickable:hover {
        border-color: #667eea;
      }

      .character-avatar {
        flex-shrink: 0;
      }

      .avatar-mount {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        overflow: hidden;
      }

      .avatar-mount canvas {
        width: 100%;
        height: 100%;
        border-radius: 50%;
      }

      .avatar-placeholder {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.85rem;
        font-weight: 600;
        color: white;
      }

      .character-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .character-name {
        font-size: 0.9rem;
        font-weight: 500;
        color: #e0e0e0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .character-role {
        font-size: 0.75rem;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .character-health {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-top: 0.25rem;
      }

      .health-bar {
        flex: 1;
        height: 6px;
        background: #2a2a2a;
        border-radius: 3px;
        overflow: hidden;
      }

      .health-fill {
        height: 100%;
        border-radius: 3px;
        transition: width 0.3s ease;
      }

      .health-good {
        background: linear-gradient(90deg, #16a34a 0%, #22c55e 100%);
      }

      .health-low {
        background: linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%);
      }

      .health-critical {
        background: linear-gradient(90deg, #dc2626 0%, #f87171 100%);
      }

      .health-text {
        font-size: 0.7rem;
        color: #666;
        min-width: 45px;
        text-align: right;
      }
    `;
    document.head.appendChild(styles);
  }
}
