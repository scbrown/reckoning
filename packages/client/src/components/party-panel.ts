/**
 * Party Panel Component
 *
 * Displays the party members with character cards showing name, role, and health.
 */

import type { Character, CharacterStats } from '@reckoning/shared';

export interface PartyPanelConfig {
  containerId: string;
  /** ID of the player character to visually distinguish them */
  playerId?: string;
}

/**
 * Mock party data for initial development
 */
const MOCK_PARTY: Character[] = [
  {
    id: 'char-1',
    name: 'Aldric the Bold',
    description: 'A weathered warrior with a scarred face and determined eyes.',
    class: 'Warrior',
    stats: {
      health: 85,
      maxHealth: 100,
    },
  },
  {
    id: 'char-2',
    name: 'Lyra Shadowmend',
    description: 'A mysterious healer wrapped in dark robes.',
    class: 'Healer',
    stats: {
      health: 45,
      maxHealth: 60,
    },
  },
  {
    id: 'char-3',
    name: 'Finn Quickfingers',
    description: 'A nimble rogue with a mischievous grin.',
    class: 'Rogue',
    stats: {
      health: 30,
      maxHealth: 50,
    },
  },
];

/**
 * Party Panel component for displaying party members
 */
export class PartyPanel {
  private container: HTMLElement;
  private members: Character[];
  private playerId: string | undefined;

  constructor(config: PartyPanelConfig) {
    const container = document.getElementById(config.containerId);
    if (!container) {
      throw new Error(`Container element #${config.containerId} not found`);
    }
    this.container = container;
    this.members = MOCK_PARTY;
    this.playerId = config.playerId;
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
      <div class="party-panel">
        <div class="party-panel-header">
          <h3>Party</h3>
        </div>
        <div class="party-panel-members" role="list" aria-label="Party members">
          ${this.members.map((member) => this.renderCharacterCard(member)).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Update party members
   */
  setMembers(members: Character[]): void {
    this.members = members;
    this.render();
  }

  /**
   * Get current party members
   */
  getMembers(): Character[] {
    return [...this.members];
  }

  /**
   * Set the player character ID for visual distinction
   */
  setPlayerId(playerId: string | undefined): void {
    this.playerId = playerId;
    this.render();
  }

  /**
   * Get the current player character ID
   */
  getPlayerId(): string | undefined {
    return this.playerId;
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

  private renderCharacterCard(character: Character): string {
    const healthPercent = this.calculateHealthPercent(character.stats);
    const healthClass = this.getHealthClass(healthPercent);
    const isPlayer = character.id === this.playerId;
    const playerClass = isPlayer ? 'character-card--player' : '';
    const playerBadge = isPlayer
      ? '<span class="player-badge" aria-label="Player character">YOU</span>'
      : '';

    return `
      <div class="character-card ${playerClass}" data-character-id="${character.id}" role="listitem" tabindex="0" aria-label="${this.escapeHtml(character.name)}, ${this.escapeHtml(character.class)}, ${character.stats.health} of ${character.stats.maxHealth} health${isPlayer ? ', player character' : ''}">
        <div class="character-avatar" aria-hidden="true">
          <div class="avatar-placeholder">${this.getInitials(character.name)}</div>
        </div>
        <div class="character-info">
          <div class="character-name-row">
            <span class="character-name">${this.escapeHtml(character.name)}</span>
            ${playerBadge}
          </div>
          <div class="character-role">${this.escapeHtml(character.class)}</div>
          <div class="character-health">
            <div class="health-bar" role="progressbar" aria-valuenow="${character.stats.health}" aria-valuemin="0" aria-valuemax="${character.stats.maxHealth}" aria-label="Health">
              <div class="health-fill ${healthClass}" style="width: ${healthPercent}%"></div>
            </div>
            <span class="health-text" aria-hidden="true">${character.stats.health}/${character.stats.maxHealth}</span>
          </div>
        </div>
      </div>
    `;
  }

  private calculateHealthPercent(stats: CharacterStats): number {
    if (stats.maxHealth <= 0) return 0;
    return Math.min(100, Math.max(0, (stats.health / stats.maxHealth) * 100));
  }

  private getHealthClass(percent: number): string {
    if (percent <= 25) return 'health-critical';
    if (percent <= 50) return 'health-low';
    return 'health-good';
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

  private injectStyles(): void {
    if (document.getElementById('party-panel-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'party-panel-styles';
    styles.textContent = `
      .party-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #111;
        border: 1px solid #333;
        border-radius: 8px;
        overflow: hidden;
      }

      .party-panel-header {
        padding: 0.75rem 1rem;
        background: #1a1a1a;
        border-bottom: 1px solid #333;
      }

      .party-panel-header h3 {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        color: #e0e0e0;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .party-panel-members {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.75rem;
        overflow-y: auto;
        flex: 1;
      }

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

      .character-card:focus {
        outline: 2px solid #667eea;
        outline-offset: 2px;
        border-color: #667eea;
        background: #222;
      }

      .character-card:focus-visible {
        outline: 2px solid #667eea;
        outline-offset: 2px;
      }

      .character-avatar {
        flex-shrink: 0;
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

      .character-name-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .character-card--player {
        border-color: #667eea;
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
      }

      .character-card--player:hover {
        border-color: #8b9cf5;
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%);
      }

      .character-card--player .avatar-placeholder {
        box-shadow: 0 0 0 2px #667eea, 0 0 8px rgba(102, 126, 234, 0.5);
      }

      .player-badge {
        font-size: 0.6rem;
        font-weight: 700;
        color: #fff;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 0.15rem 0.4rem;
        border-radius: 3px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
    `;
    document.head.appendChild(styles);
  }
}
