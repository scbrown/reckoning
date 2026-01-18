/**
 * Area Panel Component
 *
 * Displays the current area with location info, exits, and NPCs.
 * Supports pixel art scene backgrounds with fallback to text-only display.
 */

import type { Area, AreaExit, NPC, NPCDisposition, PixelArt } from '@reckoning/shared';
import { SceneBackground, type SceneBackgroundConfig } from './scene-background.js';
import type { PixelsrcRenderer } from '../services/pixelsrc/index.js';

export interface AreaPanelConfig {
  containerId: string;
  /** Optional pixelsrc renderer for scene backgrounds */
  renderer?: PixelsrcRenderer;
  /** Scene background configuration */
  sceneConfig?: SceneBackgroundConfig;
}

/**
 * Mock area data for initial development
 */
const MOCK_AREA: Area = {
  id: 'area-1',
  name: 'The Crossroads Inn',
  description:
    'A weathered tavern stands at the crossroads, its wooden sign creaking in the wind. Warm light spills from grimy windows, and the smell of roasting meat mingles with wood smoke.',
  exits: [
    {
      direction: 'North',
      targetAreaId: 'area-2',
      description: 'A muddy road leads toward the distant mountains.',
      locked: false,
    },
    {
      direction: 'East',
      targetAreaId: 'area-3',
      description: 'A forest path disappears into dark woods.',
      locked: false,
    },
    {
      direction: 'Cellar Door',
      targetAreaId: 'area-4',
      description: 'A heavy trapdoor secured with an iron padlock.',
      locked: true,
    },
  ],
  objects: [],
  npcs: [
    {
      id: 'npc-1',
      name: 'Gareth the Innkeeper',
      description: 'A portly man with a kind face and flour-dusted apron.',
      currentAreaId: 'area-1',
      disposition: 'friendly',
      tags: ['merchant', 'innkeeper'],
    },
    {
      id: 'npc-2',
      name: 'Hooded Stranger',
      description: 'A cloaked figure nursing a drink in the corner, face hidden in shadow.',
      currentAreaId: 'area-1',
      disposition: 'neutral',
      tags: ['mysterious'],
    },
  ],
  tags: ['tavern', 'safe-zone'],
};

/**
 * Area Panel component for displaying current location
 */
export class AreaPanel {
  private container: HTMLElement;
  private area: Area;
  private renderer: PixelsrcRenderer | undefined;
  private sceneConfig: SceneBackgroundConfig;
  private sceneBackground: SceneBackground | null = null;
  private currentPixelArt: PixelArt | null = null;

  constructor(config: AreaPanelConfig) {
    const container = document.getElementById(config.containerId);
    if (!container) {
      throw new Error(`Container element #${config.containerId} not found`);
    }
    this.container = container;
    this.area = MOCK_AREA;
    this.renderer = config.renderer;
    this.sceneConfig = config.sceneConfig ?? {};
    this.injectStyles();
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Render the component
   */
  render(): void {
    // Clean up existing scene background
    if (this.sceneBackground) {
      this.sceneBackground.destroy();
      this.sceneBackground = null;
    }

    const hasSceneBackground = this.currentPixelArt !== null && this.renderer !== undefined;

    this.container.innerHTML = `
      <div class="area-panel">
        <div class="area-panel-header">
          <h3>${this.escapeHtml(this.area.name)}</h3>
        </div>
        <div class="area-panel-content">
          ${hasSceneBackground ? '<div class="area-scene-container" id="area-scene-container"></div>' : ''}
          <div class="area-description ${hasSceneBackground ? 'has-scene' : ''}">
            ${this.escapeHtml(this.area.description)}
          </div>

          <div class="area-section">
            <h4>Exits</h4>
            <div class="area-exits">
              ${this.area.exits.length > 0 ? this.area.exits.map((exit) => this.renderExit(exit)).join('') : '<div class="area-empty">No visible exits</div>'}
            </div>
          </div>

          <div class="area-section">
            <h4>NPCs</h4>
            <div class="area-npcs">
              ${this.area.npcs.length > 0 ? this.area.npcs.map((npc) => this.renderNPC(npc)).join('') : '<div class="area-empty">No one here</div>'}
            </div>
          </div>
        </div>
      </div>
    `;

    // Initialize scene background if we have pixel art and a renderer
    if (hasSceneBackground && this.currentPixelArt && this.renderer) {
      this.initSceneBackground();
    }
  }

  /**
   * Initialize the scene background component
   */
  private initSceneBackground(): void {
    if (!this.currentPixelArt || !this.renderer) {
      return;
    }

    const sceneContainer = document.getElementById('area-scene-container');
    if (!sceneContainer) {
      return;
    }

    try {
      this.sceneBackground = new SceneBackground(
        this.currentPixelArt,
        this.renderer,
        this.area.pixelArtRef?.spriteName,
        this.sceneConfig
      );

      sceneContainer.appendChild(this.sceneBackground.getElement());
    } catch (error) {
      console.error('AreaPanel: Failed to initialize scene background', error);
      // Scene background failed, but text fallback is already rendered
    }
  }

  /**
   * Update the displayed area
   *
   * @param area - The area to display
   * @param pixelArt - Optional pixel art for scene background (loaded from server)
   */
  setArea(area: Area, pixelArt?: PixelArt): void {
    this.area = area;
    this.currentPixelArt = pixelArt ?? null;
    this.render();
  }

  /**
   * Update the scene pixel art without changing the area
   *
   * @param pixelArt - The pixel art to display, or null to remove
   */
  setPixelArt(pixelArt: PixelArt | null): void {
    this.currentPixelArt = pixelArt;
    this.render();
  }

  /**
   * Get the current area
   */
  getArea(): Area {
    return { ...this.area };
  }

  /**
   * Check if the area has a scene background
   */
  hasSceneBackground(): boolean {
    return this.sceneBackground !== null;
  }

  /**
   * Get the scene background component (for external animation control)
   */
  getSceneBackground(): SceneBackground | null {
    return this.sceneBackground;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.sceneBackground) {
      this.sceneBackground.destroy();
      this.sceneBackground = null;
    }
    this.currentPixelArt = null;
    this.container.innerHTML = '';
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private renderExit(exit: AreaExit): string {
    const lockedClass = exit.locked ? 'exit-locked' : '';
    const lockIcon = exit.locked ? '<span class="lock-icon">🔒</span>' : '';

    return `
      <div class="exit-item ${lockedClass}" data-target="${exit.targetAreaId}">
        <div class="exit-direction">
          ${this.escapeHtml(exit.direction)}
          ${lockIcon}
        </div>
        <div class="exit-description">${this.escapeHtml(exit.description)}</div>
      </div>
    `;
  }

  private renderNPC(npc: NPC): string {
    const dispositionClass = `disposition-${npc.disposition}`;

    return `
      <div class="npc-item" data-npc-id="${npc.id}">
        <div class="npc-header">
          <span class="npc-name">${this.escapeHtml(npc.name)}</span>
          <span class="npc-disposition ${dispositionClass}">${this.formatDisposition(npc.disposition)}</span>
        </div>
        <div class="npc-description">${this.escapeHtml(npc.description)}</div>
      </div>
    `;
  }

  private formatDisposition(disposition: NPCDisposition): string {
    const labels: Record<NPCDisposition, string> = {
      hostile: 'Hostile',
      unfriendly: 'Unfriendly',
      neutral: 'Neutral',
      friendly: 'Friendly',
      allied: 'Allied',
    };
    return labels[disposition];
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private injectStyles(): void {
    if (document.getElementById('area-panel-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'area-panel-styles';
    styles.textContent = `
      .area-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #111;
        border: 1px solid #333;
        border-radius: 8px;
        overflow: hidden;
      }

      .area-panel-header {
        padding: 0.75rem 1rem;
        background: #1a1a1a;
        border-bottom: 1px solid #333;
      }

      .area-panel-header h3 {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        color: #e0e0e0;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .area-panel-content {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 0.75rem;
        overflow-y: auto;
        flex: 1;
      }

      /* Scene background container */
      .area-scene-container {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 0.5rem;
        background: #0a0a0f;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
        min-height: 192px;
      }

      .area-scene-container canvas {
        max-width: 100%;
        height: auto;
      }

      .area-description {
        font-size: 0.85rem;
        color: #b0b0b0;
        line-height: 1.5;
        padding: 0.75rem;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
      }

      /* When scene background is present, make description more compact */
      .area-description.has-scene {
        background: rgba(26, 26, 26, 0.9);
        font-size: 0.8rem;
        padding: 0.5rem 0.75rem;
      }

      .area-section h4 {
        margin: 0 0 0.5rem 0;
        font-size: 0.8rem;
        font-weight: 600;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .area-exits,
      .area-npcs {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .area-empty {
        font-size: 0.8rem;
        color: #666;
        font-style: italic;
        padding: 0.5rem;
      }

      /* Exit Items */
      .exit-item {
        padding: 0.5rem 0.75rem;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
        transition: all 0.2s;
        cursor: pointer;
      }

      .exit-item:hover {
        border-color: #444;
        background: #222;
      }

      .exit-item.exit-locked {
        opacity: 0.7;
        cursor: not-allowed;
      }

      .exit-item.exit-locked:hover {
        border-color: #2a2a2a;
        background: #1a1a1a;
      }

      .exit-direction {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;
        font-weight: 500;
        color: #e0e0e0;
        margin-bottom: 0.25rem;
      }

      .lock-icon {
        font-size: 0.75rem;
      }

      .exit-description {
        font-size: 0.75rem;
        color: #888;
      }

      /* NPC Items */
      .npc-item {
        padding: 0.5rem 0.75rem;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
        transition: all 0.2s;
      }

      .npc-item:hover {
        border-color: #444;
        background: #222;
      }

      .npc-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.25rem;
      }

      .npc-name {
        font-size: 0.85rem;
        font-weight: 500;
        color: #e0e0e0;
      }

      .npc-disposition {
        font-size: 0.65rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 0.125rem 0.5rem;
        border-radius: 10px;
      }

      .disposition-hostile {
        background: rgba(220, 38, 38, 0.2);
        color: #f87171;
      }

      .disposition-unfriendly {
        background: rgba(245, 158, 11, 0.2);
        color: #fbbf24;
      }

      .disposition-neutral {
        background: rgba(107, 114, 128, 0.2);
        color: #9ca3af;
      }

      .disposition-friendly {
        background: rgba(34, 197, 94, 0.2);
        color: #4ade80;
      }

      .disposition-allied {
        background: rgba(59, 130, 246, 0.2);
        color: #60a5fa;
      }

      .npc-description {
        font-size: 0.75rem;
        color: #888;
      }
    `;
    document.head.appendChild(styles);
  }
}
