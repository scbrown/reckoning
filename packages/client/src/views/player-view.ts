/**
 * Player View Component
 *
 * Per-character subjective view at /game/:id/view/player/:charId
 *
 * Shows:
 * - Narration (same as party)
 * - Their character's known traits
 * - Their PERCEPTION of relationships (may differ from truth)
 * - Personal inventory (when available)
 * - Actions available to their character
 *
 * Hides:
 * - Other players' character sheets
 * - Hidden traits (until revealed)
 * - DM notes, emergence/evolution internals
 *
 * Mobile-friendly design.
 */

import { NarrationDisplay } from '../components/shared/index.js';
import { CharacterCard } from '../components/character-card.js';

/**
 * Player view state from API
 */
export interface PlayerViewState {
  game: {
    id: string;
    turn: number;
    currentAreaId: string | null;
  };
  character: {
    id: string;
    name: string;
    description: string;
    class: string;
    stats: {
      health: number;
      maxHealth: number;
      [key: string]: number;
    };
    pixelArtRef?: {
      path: string;
      spriteName: string;
    };
  } | null;
  partyMembers: Array<{
    id: string;
    name: string;
    class: string;
    visibleTraits: string[];
  }>;
  area: {
    id: string;
    name: string;
    description: string;
  } | null;
  npcs: Array<{
    id: string;
    name: string;
    description: string;
    disposition: string;
  }>;
  ownTraits: Array<{
    trait: string;
    acquiredTurn: number;
  }>;
  relationships: Array<{
    targetId: string;
    targetName: string;
    targetType: 'character' | 'npc';
    perceivedTrust: number | null;
    perceivedRespect: number | null;
    perceivedAffection: number | null;
  }>;
  narration: string[];
  scene: {
    id: string;
    name: string | null;
    sceneType: string | null;
    mood?: string;
  } | null;
}

/**
 * Configuration for Player View
 */
export interface PlayerViewConfig {
  containerId: string;
  gameId: string;
  characterId: string;
}

/**
 * Callbacks for Player View
 */
export interface PlayerViewCallbacks {
  onShowError?: (message: string) => void;
}

/**
 * Player View - Per-character subjective game view
 */
export class PlayerView {
  private container: HTMLElement | null;
  private config: PlayerViewConfig;
  private callbacks: PlayerViewCallbacks;

  // State
  private state: PlayerViewState | null = null;
  private pollInterval: number | null = null;

  // Components
  private narrationDisplay: NarrationDisplay | null = null;

  constructor(config: PlayerViewConfig, callbacks: PlayerViewCallbacks = {}) {
    this.container = document.getElementById(config.containerId);
    this.config = config;
    this.callbacks = callbacks;
    this.injectStyles();
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Mount the view
   */
  async mount(): Promise<void> {
    if (!this.container) return;

    // Render initial structure
    this.render();

    // Initialize components
    this.initializeComponents();

    // Load initial state
    await this.loadState();

    // Start polling for updates
    this.startPolling();
  }

  /**
   * Unmount the view
   */
  unmount(): void {
    this.stopPolling();

    // Cleanup components
    this.narrationDisplay?.destroy();
    this.narrationDisplay = null;

    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private render(): void {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="player-view">
        <div class="player-view__header">
          <div class="player-view__character-info" id="player-character-info"></div>
          <div class="player-view__location" id="player-location"></div>
        </div>

        <div class="player-view__main">
          <div class="player-view__narration" id="player-narration"></div>

          <div class="player-view__sidebar">
            <div class="player-view__traits" id="player-traits">
              <div class="panel-header">Your Traits</div>
              <div class="traits-list" id="traits-list"></div>
            </div>

            <div class="player-view__relationships" id="player-relationships">
              <div class="panel-header">Relationships</div>
              <div class="relationships-list" id="relationships-list"></div>
            </div>

            <div class="player-view__party" id="player-party">
              <div class="panel-header">Party</div>
              <div class="party-list" id="party-list"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private initializeComponents(): void {
    // Initialize narration display
    const narrationContainer = document.getElementById('player-narration');
    if (narrationContainer) {
      this.narrationDisplay = new NarrationDisplay(narrationContainer, {
        title: 'Story',
        showAutoScrollToggle: true,
      });
      this.narrationDisplay.render();
    }
  }

  private async loadState(): Promise<void> {
    try {
      const response = await fetch(
        `/api/view/${this.config.gameId}/player/${this.config.characterId}`
      );

      if (!response.ok) {
        throw new Error(`Failed to load player view: ${response.statusText}`);
      }

      this.state = await response.json();
      this.updateUI();
    } catch (error) {
      console.error('[PlayerView] Failed to load state:', error);
      this.callbacks.onShowError?.(
        error instanceof Error ? error.message : 'Failed to load player view'
      );
    }
  }

  private startPolling(): void {
    // Poll every 2 seconds for updates
    this.pollInterval = window.setInterval(() => {
      this.loadState();
    }, 2000);
  }

  private stopPolling(): void {
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private updateUI(): void {
    if (!this.state) return;

    this.updateCharacterInfo();
    this.updateLocation();
    this.updateNarration();
    this.updateTraits();
    this.updateRelationships();
    this.updateParty();
  }

  private updateCharacterInfo(): void {
    const container = document.getElementById('player-character-info');
    if (!container || !this.state?.character) return;

    const char = this.state.character;
    const healthPercent = CharacterCard.calculateHealthPercent(char.stats);
    const healthClass = CharacterCard.getHealthClass(healthPercent);

    container.innerHTML = `
      <div class="character-header">
        <div class="character-avatar">
          <div class="avatar-placeholder">${this.getInitials(char.name)}</div>
        </div>
        <div class="character-details">
          <h1 class="character-name">${this.escapeHtml(char.name)}</h1>
          <div class="character-class">${this.escapeHtml(char.class)}</div>
        </div>
        <div class="character-health">
          <div class="health-bar">
            <div class="health-fill ${healthClass}" style="width: ${healthPercent}%"></div>
          </div>
          <span class="health-text">${char.stats.health}/${char.stats.maxHealth} HP</span>
        </div>
      </div>
    `;
  }

  private updateLocation(): void {
    const container = document.getElementById('player-location');
    if (!container) return;

    if (this.state?.area) {
      container.innerHTML = `
        <div class="location-info">
          <span class="location-name">${this.escapeHtml(this.state.area.name)}</span>
          ${this.state.scene?.name ? `<span class="scene-name">${this.escapeHtml(this.state.scene.name)}</span>` : ''}
        </div>
      `;
    } else {
      container.innerHTML = '<div class="location-info">Unknown Location</div>';
    }
  }

  private updateNarration(): void {
    if (!this.narrationDisplay || !this.state) return;

    // Convert narration strings to NarrativeEntry format
    const entries = this.state.narration.map((text, index) => {
      // Parse speaker from "Speaker: text" format
      const speakerMatch = text.match(/^([^:]+):\s*(.+)$/);

      return {
        id: `narration-${index}`,
        content: speakerMatch ? speakerMatch[2] : text,
        type: speakerMatch ? 'party_dialogue' as const : 'narration' as const,
        speaker: speakerMatch ? speakerMatch[1] : undefined,
        timestamp: Date.now(),
        isTTSPlaying: false,
      };
    });

    this.narrationDisplay.update(entries);
  }

  private updateTraits(): void {
    const container = document.getElementById('traits-list');
    if (!container || !this.state) return;

    if (this.state.ownTraits.length === 0) {
      container.innerHTML = '<div class="empty-message">No traits acquired yet</div>';
      return;
    }

    container.innerHTML = this.state.ownTraits
      .map(
        (trait) => `
        <div class="trait-item">
          <span class="trait-name">${this.escapeHtml(trait.trait)}</span>
          <span class="trait-turn">Turn ${trait.acquiredTurn}</span>
        </div>
      `
      )
      .join('');
  }

  private updateRelationships(): void {
    const container = document.getElementById('relationships-list');
    if (!container || !this.state) return;

    if (this.state.relationships.length === 0) {
      container.innerHTML = '<div class="empty-message">No relationships yet</div>';
      return;
    }

    container.innerHTML = this.state.relationships
      .map((rel) => {
        const trustLevel = this.getRelationshipLevel(rel.perceivedTrust);
        const respectLevel = this.getRelationshipLevel(rel.perceivedRespect);
        const affectionLevel = this.getRelationshipLevel(rel.perceivedAffection);

        return `
          <div class="relationship-item">
            <div class="relationship-header">
              <span class="relationship-name">${this.escapeHtml(rel.targetName)}</span>
              <span class="relationship-type">${rel.targetType}</span>
            </div>
            <div class="relationship-dimensions">
              <div class="dimension" title="Trust: ${trustLevel}">
                <span class="dimension-label">Trust</span>
                <div class="dimension-bar">
                  <div class="dimension-fill" style="width: ${(rel.perceivedTrust ?? 0.5) * 100}%"></div>
                </div>
              </div>
              <div class="dimension" title="Respect: ${respectLevel}">
                <span class="dimension-label">Respect</span>
                <div class="dimension-bar">
                  <div class="dimension-fill" style="width: ${(rel.perceivedRespect ?? 0.5) * 100}%"></div>
                </div>
              </div>
              <div class="dimension" title="Affection: ${affectionLevel}">
                <span class="dimension-label">Affection</span>
                <div class="dimension-bar">
                  <div class="dimension-fill" style="width: ${(rel.perceivedAffection ?? 0.5) * 100}%"></div>
                </div>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  private updateParty(): void {
    const container = document.getElementById('party-list');
    if (!container || !this.state) return;

    if (this.state.partyMembers.length === 0) {
      container.innerHTML = '<div class="empty-message">No party members</div>';
      return;
    }

    container.innerHTML = this.state.partyMembers
      .map(
        (member) => `
        <div class="party-member">
          <div class="party-member-avatar">
            <div class="avatar-placeholder small">${this.getInitials(member.name)}</div>
          </div>
          <div class="party-member-info">
            <span class="party-member-name">${this.escapeHtml(member.name)}</span>
            <span class="party-member-class">${this.escapeHtml(member.class)}</span>
          </div>
          ${
            member.visibleTraits.length > 0
              ? `<div class="party-member-traits">${member.visibleTraits.map((t) => `<span class="visible-trait">${this.escapeHtml(t)}</span>`).join('')}</div>`
              : ''
          }
        </div>
      `
      )
      .join('');
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

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

  private getRelationshipLevel(value: number | null): string {
    if (value === null) return 'Unknown';
    if (value < 0.2) return 'Very Low';
    if (value < 0.4) return 'Low';
    if (value < 0.6) return 'Neutral';
    if (value < 0.8) return 'Good';
    return 'Excellent';
  }

  // ===========================================================================
  // Styles
  // ===========================================================================

  private injectStyles(): void {
    if (document.getElementById('player-view-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'player-view-styles';
    styles.textContent = `
      .player-view {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #0a0a0a;
        color: #e0e0e0;
      }

      .player-view__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem;
        background: #111;
        border-bottom: 1px solid #333;
        flex-wrap: wrap;
        gap: 1rem;
      }

      .character-header {
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      .character-avatar {
        flex-shrink: 0;
      }

      .avatar-placeholder {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1rem;
        font-weight: 600;
        color: white;
      }

      .avatar-placeholder.small {
        width: 32px;
        height: 32px;
        font-size: 0.75rem;
      }

      .character-details {
        display: flex;
        flex-direction: column;
      }

      .character-name {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
      }

      .character-class {
        font-size: 0.875rem;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .character-health {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 120px;
      }

      .health-bar {
        height: 8px;
        background: #2a2a2a;
        border-radius: 4px;
        overflow: hidden;
      }

      .health-fill {
        height: 100%;
        border-radius: 4px;
        transition: width 0.3s ease;
      }

      .health-fill.health-good {
        background: linear-gradient(90deg, #16a34a 0%, #22c55e 100%);
      }

      .health-fill.health-low {
        background: linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%);
      }

      .health-fill.health-critical {
        background: linear-gradient(90deg, #dc2626 0%, #f87171 100%);
      }

      .health-text {
        font-size: 0.75rem;
        color: #888;
        text-align: right;
      }

      .location-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
      }

      .location-name {
        color: #667eea;
        font-weight: 500;
      }

      .scene-name {
        color: #888;
      }

      .scene-name::before {
        content: '•';
        margin-right: 0.5rem;
      }

      .player-view__main {
        display: flex;
        flex: 1;
        min-height: 0;
        gap: 1rem;
        padding: 1rem;
      }

      .player-view__narration {
        flex: 2;
        min-width: 0;
        height: 100%;
      }

      .player-view__sidebar {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-width: 250px;
        max-width: 350px;
        overflow-y: auto;
      }

      .panel-header {
        font-size: 0.875rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #888;
        padding: 0.5rem;
        border-bottom: 1px solid #333;
        margin-bottom: 0.5rem;
      }

      .player-view__traits,
      .player-view__relationships,
      .player-view__party {
        background: #111;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 0.75rem;
      }

      .traits-list,
      .relationships-list,
      .party-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .empty-message {
        color: #666;
        font-style: italic;
        text-align: center;
        padding: 1rem;
      }

      .trait-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem;
        background: #1a1a1a;
        border-radius: 4px;
      }

      .trait-name {
        font-weight: 500;
        text-transform: capitalize;
      }

      .trait-turn {
        font-size: 0.75rem;
        color: #666;
      }

      .relationship-item {
        padding: 0.5rem;
        background: #1a1a1a;
        border-radius: 4px;
      }

      .relationship-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
      }

      .relationship-name {
        font-weight: 500;
      }

      .relationship-type {
        font-size: 0.75rem;
        color: #666;
        text-transform: capitalize;
      }

      .relationship-dimensions {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .dimension {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .dimension-label {
        font-size: 0.75rem;
        color: #888;
        min-width: 60px;
      }

      .dimension-bar {
        flex: 1;
        height: 4px;
        background: #2a2a2a;
        border-radius: 2px;
        overflow: hidden;
      }

      .dimension-fill {
        height: 100%;
        background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
        border-radius: 2px;
        transition: width 0.3s ease;
      }

      .party-member {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem;
        background: #1a1a1a;
        border-radius: 4px;
      }

      .party-member-info {
        display: flex;
        flex-direction: column;
        flex: 1;
      }

      .party-member-name {
        font-weight: 500;
        font-size: 0.875rem;
      }

      .party-member-class {
        font-size: 0.75rem;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }

      .party-member-traits {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
      }

      .visible-trait {
        font-size: 0.625rem;
        padding: 0.125rem 0.375rem;
        background: #333;
        border-radius: 3px;
        color: #aaa;
        text-transform: capitalize;
      }

      /* Mobile Responsive */
      @media (max-width: 768px) {
        .player-view__main {
          flex-direction: column;
        }

        .player-view__sidebar {
          max-width: none;
          flex-direction: row;
          flex-wrap: wrap;
        }

        .player-view__traits,
        .player-view__relationships,
        .player-view__party {
          flex: 1;
          min-width: 200px;
        }

        .player-view__header {
          flex-direction: column;
          align-items: flex-start;
        }

        .character-header {
          width: 100%;
        }

        .character-health {
          margin-left: auto;
        }
      }

      @media (max-width: 480px) {
        .player-view__header {
          padding: 0.75rem;
        }

        .player-view__main {
          padding: 0.5rem;
          gap: 0.5rem;
        }

        .avatar-placeholder {
          width: 40px;
          height: 40px;
          font-size: 0.875rem;
        }

        .character-name {
          font-size: 1rem;
        }

        .player-view__sidebar {
          flex-direction: column;
        }

        .player-view__traits,
        .player-view__relationships,
        .player-view__party {
          min-width: auto;
        }
      }
    `;
    document.head.appendChild(styles);
  }
}

export default PlayerView;
