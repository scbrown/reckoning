/**
 * Scene Panel Component
 *
 * UI for DM to manage scenes. Shows current scene indicator,
 * available scenes, scene details, and allows scene lifecycle management.
 */

import type {
  SceneDTO,
  SceneSummaryDTO,
  SceneConnectionDTO,
  ConnectionType,
  CreateSceneDTO,
} from '../services/game/index.js';

/**
 * Configuration for ScenePanel
 */
export interface ScenePanelConfig {
  containerId: string;
}

/**
 * Callbacks for scene actions
 */
export interface ScenePanelCallbacks {
  onSceneStart: (sceneId: string, turn: number) => Promise<void>;
  onSceneComplete: (sceneId: string, turn: number) => Promise<void>;
  onSceneCreate: (scene: CreateSceneDTO) => Promise<void>;
  onSceneSelect: (sceneId: string) => void;
}

/**
 * View mode for the panel
 */
type ViewMode = 'list' | 'create';

/**
 * Scene Panel component for DM scene management
 */
export class ScenePanel {
  private container: HTMLElement;
  private callbacks: ScenePanelCallbacks;
  private currentScene: SceneDTO | null = null;
  private availableScenes: SceneSummaryDTO[] = [];
  private allScenes: SceneDTO[] = [];
  private selectedSceneId: string | null = null;
  private selectedSceneDetails: (SceneSummaryDTO & { connections: SceneConnectionDTO[]; connectedScenes: SceneSummaryDTO[] }) | null = null;
  private currentTurn: number = 0;
  private viewMode: ViewMode = 'list';
  private isLoading: boolean = false;

  // Create form state
  private createFormValues: Partial<CreateSceneDTO> = {};

  constructor(config: ScenePanelConfig, callbacks: ScenePanelCallbacks) {
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
    this.updateDOM();
  }

  /**
   * Set the current scene
   */
  setCurrentScene(scene: SceneDTO | null): void {
    this.currentScene = scene;
    this.updateDOM();
  }

  /**
   * Set available scenes
   */
  setAvailableScenes(scenes: SceneSummaryDTO[]): void {
    this.availableScenes = scenes;
    this.updateDOM();
  }

  /**
   * Set all scenes (for history view)
   */
  setAllScenes(scenes: SceneDTO[]): void {
    this.allScenes = scenes;
    this.updateDOM();
  }

  /**
   * Set selected scene details
   */
  setSelectedSceneDetails(details: SceneSummaryDTO & { connections: SceneConnectionDTO[]; connectedScenes: SceneSummaryDTO[] } | null): void {
    this.selectedSceneDetails = details;
    this.updateDOM();
  }

  /**
   * Set the current turn number
   */
  setCurrentTurn(turn: number): void {
    this.currentTurn = turn;
    this.updateDOM();
  }

  /**
   * Set loading state
   */
  setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.updateDOM();
  }

  /**
   * Select a scene by ID
   */
  selectScene(id: string | null): void {
    this.selectedSceneId = id;
    if (id) {
      this.callbacks.onSceneSelect(id);
    } else {
      this.selectedSceneDetails = null;
    }
    this.updateDOM();
  }

  /**
   * Check if there's an active scene
   */
  hasActiveScene(): boolean {
    return this.currentScene !== null;
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

  private updateDOM(): void {
    this.container.innerHTML = `
      <div class="scene-panel ${this.isLoading ? 'loading' : ''}">
        <div class="scene-header">
          <h3>Scenes</h3>
          <div class="scene-header-actions">
            ${this.viewMode === 'list' ? `
              <button class="scene-header-btn" data-action="show-create" title="Create new scene">+</button>
            ` : `
              <button class="scene-header-btn" data-action="show-list" title="Back to list">←</button>
            `}
          </div>
        </div>
        ${this.viewMode === 'create' ? this.renderCreateForm() : this.renderListView()}
      </div>
    `;

    this.attachEventListeners();
  }

  private renderListView(): string {
    return `
      ${this.renderCurrentScene()}
      ${this.renderSceneList()}
      ${this.selectedSceneId ? this.renderSceneDetails() : ''}
    `;
  }

  private renderCurrentScene(): string {
    if (!this.currentScene) {
      return `
        <div class="scene-current scene-current-empty">
          <span class="scene-current-label">No Active Scene</span>
        </div>
      `;
    }

    const name = this.currentScene.name || 'Unnamed Scene';
    const mood = this.currentScene.mood;

    return `
      <div class="scene-current">
        <div class="scene-current-indicator">
          <span class="scene-current-dot"></span>
          <span class="scene-current-label">Current Scene</span>
        </div>
        <div class="scene-current-name">${this.escapeHtml(name)}</div>
        ${mood ? `<div class="scene-current-mood">${this.escapeHtml(mood)}</div>` : ''}
        <div class="scene-current-meta">
          <span>Started turn ${this.currentScene.startedTurn}</span>
          ${this.currentScene.sceneType ? `<span class="scene-type-badge">${this.escapeHtml(this.currentScene.sceneType)}</span>` : ''}
        </div>
        <button class="btn btn-complete" data-action="complete" data-scene-id="${this.currentScene.id}">
          End Scene
        </button>
      </div>
    `;
  }

  private renderSceneList(): string {
    // Combine available scenes with history
    const completedScenes = this.allScenes.filter(s => s.status === 'completed');
    const hasScenes = this.availableScenes.length > 0 || completedScenes.length > 0;

    if (!hasScenes) {
      return `
        <div class="scene-list-empty">
          <span>No scenes yet</span>
        </div>
      `;
    }

    return `
      <div class="scene-list" role="listbox" aria-label="Available scenes">
        ${this.availableScenes.length > 0 ? `
          <div class="scene-list-section">
            <div class="scene-list-section-header">Available</div>
            ${this.availableScenes.map(s => this.renderSceneItem(s)).join('')}
          </div>
        ` : ''}
        ${completedScenes.length > 0 ? `
          <div class="scene-list-section">
            <div class="scene-list-section-header">History</div>
            ${completedScenes.slice(0, 5).map(s => this.renderHistoryItem(s)).join('')}
            ${completedScenes.length > 5 ? `<div class="scene-list-more">+${completedScenes.length - 5} more</div>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderSceneItem(summary: SceneSummaryDTO): string {
    const scene = summary.scene;
    const isSelected = scene.id === this.selectedSceneId;
    const isCurrent = summary.isCurrentScene;
    const name = scene.name || 'Unnamed Scene';

    return `
      <div
        class="scene-item ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}"
        role="option"
        aria-selected="${isSelected}"
        data-scene-id="${scene.id}"
        tabindex="${isSelected ? '0' : '-1'}"
      >
        <div class="scene-item-header">
          <span class="scene-item-name">${this.escapeHtml(name)}</span>
          ${isCurrent ? '<span class="scene-item-current-badge">Active</span>' : ''}
        </div>
        ${scene.description ? `<div class="scene-item-desc">${this.escapeHtml(scene.description.slice(0, 60))}${scene.description.length > 60 ? '...' : ''}</div>` : ''}
        <div class="scene-item-meta">
          ${scene.sceneType ? `<span class="scene-type-badge scene-type-${scene.sceneType}">${this.escapeHtml(scene.sceneType)}</span>` : ''}
          <span class="scene-item-events">${summary.eventCount} events</span>
        </div>
      </div>
    `;
  }

  private renderHistoryItem(scene: SceneDTO): string {
    const isSelected = scene.id === this.selectedSceneId;
    const name = scene.name || 'Unnamed Scene';

    return `
      <div
        class="scene-item scene-item-history ${isSelected ? 'selected' : ''}"
        role="option"
        aria-selected="${isSelected}"
        data-scene-id="${scene.id}"
        tabindex="${isSelected ? '0' : '-1'}"
      >
        <div class="scene-item-header">
          <span class="scene-item-name">${this.escapeHtml(name)}</span>
          <span class="scene-status-badge status-${scene.status}">${scene.status}</span>
        </div>
        <div class="scene-item-meta">
          <span>Turns ${scene.startedTurn}-${scene.completedTurn || '?'}</span>
        </div>
      </div>
    `;
  }

  private renderSceneDetails(): string {
    if (!this.selectedSceneDetails) {
      return `
        <div class="scene-details scene-details-loading">
          <span>Loading...</span>
        </div>
      `;
    }

    const scene = this.selectedSceneDetails.scene;
    const name = scene.name || 'Unnamed Scene';
    const canStart = !this.selectedSceneDetails.isCurrentScene && scene.status !== 'completed' && scene.status !== 'abandoned';

    return `
      <div class="scene-details">
        <div class="scene-detail-row">
          <span class="detail-label">Name:</span>
          <span class="detail-value">${this.escapeHtml(name)}</span>
        </div>
        ${scene.description ? `
          <div class="scene-detail-row scene-description">
            <span class="detail-label">Description:</span>
            <span class="detail-value">${this.escapeHtml(scene.description)}</span>
          </div>
        ` : ''}
        ${scene.mood ? `
          <div class="scene-detail-row">
            <span class="detail-label">Mood:</span>
            <span class="detail-value scene-mood">${this.escapeHtml(scene.mood)}</span>
          </div>
        ` : ''}
        ${scene.stakes ? `
          <div class="scene-detail-row">
            <span class="detail-label">Stakes:</span>
            <span class="detail-value scene-stakes">${this.escapeHtml(scene.stakes)}</span>
          </div>
        ` : ''}
        <div class="scene-detail-row">
          <span class="detail-label">Status:</span>
          <span class="detail-value scene-status-badge status-${scene.status}">${scene.status}</span>
        </div>
        <div class="scene-detail-row">
          <span class="detail-label">Events:</span>
          <span class="detail-value">${this.selectedSceneDetails.eventCount}</span>
        </div>
        ${this.selectedSceneDetails.connections.length > 0 ? this.renderConnections() : ''}
        ${canStart ? `
          <div class="scene-actions">
            <button class="btn btn-start" data-action="start" data-scene-id="${scene.id}">
              Start Scene
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderConnections(): string {
    if (!this.selectedSceneDetails) return '';

    const connections = this.selectedSceneDetails.connections;
    const connectedScenes = this.selectedSceneDetails.connectedScenes;

    return `
      <div class="scene-connections">
        <div class="detail-label">Connections:</div>
        <div class="connection-list">
          ${connections.map(conn => {
            const targetScene = connectedScenes.find(s => s.scene.id === conn.toSceneId);
            const targetName = targetScene?.scene.name || 'Unknown Scene';
            return `
              <div class="connection-item">
                <span class="connection-type connection-type-${conn.connectionType}">${this.formatConnectionType(conn.connectionType)}</span>
                <span class="connection-target">${this.escapeHtml(targetName)}</span>
                ${conn.description ? `<span class="connection-desc">${this.escapeHtml(conn.description)}</span>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  private renderCreateForm(): string {
    return `
      <div class="scene-create-form">
        <div class="form-group">
          <label for="scene-name">Name</label>
          <input
            type="text"
            id="scene-name"
            class="form-input"
            placeholder="Scene name..."
            value="${this.escapeHtml(this.createFormValues.name || '')}"
          />
        </div>
        <div class="form-group">
          <label for="scene-description">Description</label>
          <textarea
            id="scene-description"
            class="form-input form-textarea"
            placeholder="What happens in this scene..."
            rows="3"
          >${this.escapeHtml(this.createFormValues.description || '')}</textarea>
        </div>
        <div class="form-group">
          <label for="scene-type">Type</label>
          <select id="scene-type" class="form-input">
            <option value="">Select type...</option>
            <option value="exploration" ${this.createFormValues.sceneType === 'exploration' ? 'selected' : ''}>Exploration</option>
            <option value="combat" ${this.createFormValues.sceneType === 'combat' ? 'selected' : ''}>Combat</option>
            <option value="social" ${this.createFormValues.sceneType === 'social' ? 'selected' : ''}>Social</option>
            <option value="puzzle" ${this.createFormValues.sceneType === 'puzzle' ? 'selected' : ''}>Puzzle</option>
            <option value="rest" ${this.createFormValues.sceneType === 'rest' ? 'selected' : ''}>Rest</option>
            <option value="transition" ${this.createFormValues.sceneType === 'transition' ? 'selected' : ''}>Transition</option>
          </select>
        </div>
        <div class="form-group">
          <label for="scene-mood">Mood</label>
          <input
            type="text"
            id="scene-mood"
            class="form-input"
            placeholder="Tense, mysterious, cheerful..."
            value="${this.escapeHtml(this.createFormValues.mood || '')}"
          />
        </div>
        <div class="form-group">
          <label for="scene-stakes">Stakes</label>
          <input
            type="text"
            id="scene-stakes"
            class="form-input"
            placeholder="What's at risk..."
            value="${this.escapeHtml(this.createFormValues.stakes || '')}"
          />
        </div>
        <div class="form-actions">
          <button class="btn btn-create" data-action="create">Create Scene</button>
          <button class="btn btn-cancel" data-action="cancel-create">Cancel</button>
        </div>
      </div>
    `;
  }

  private attachEventListeners(): void {
    // Header actions
    const showCreateBtn = this.container.querySelector('[data-action="show-create"]');
    const showListBtn = this.container.querySelector('[data-action="show-list"]');

    showCreateBtn?.addEventListener('click', () => {
      this.viewMode = 'create';
      this.createFormValues = {};
      this.updateDOM();
    });

    showListBtn?.addEventListener('click', () => {
      this.viewMode = 'list';
      this.updateDOM();
    });

    // Scene list selection
    const items = this.container.querySelectorAll('.scene-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-scene-id');
        if (id) {
          this.selectScene(id);
        }
      });
      item.addEventListener('keydown', (e) => {
        const event = e as KeyboardEvent;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          const id = item.getAttribute('data-scene-id');
          if (id) {
            this.selectScene(id);
          }
        }
      });
    });

    // Start scene
    const startBtn = this.container.querySelector('[data-action="start"]');
    startBtn?.addEventListener('click', () => this.handleStartScene());

    // Complete scene
    const completeBtn = this.container.querySelector('[data-action="complete"]');
    completeBtn?.addEventListener('click', () => this.handleCompleteScene());

    // Create form
    if (this.viewMode === 'create') {
      this.attachCreateFormListeners();
    }
  }

  private attachCreateFormListeners(): void {
    const nameInput = this.container.querySelector('#scene-name') as HTMLInputElement;
    const descInput = this.container.querySelector('#scene-description') as HTMLTextAreaElement;
    const typeSelect = this.container.querySelector('#scene-type') as HTMLSelectElement;
    const moodInput = this.container.querySelector('#scene-mood') as HTMLInputElement;
    const stakesInput = this.container.querySelector('#scene-stakes') as HTMLInputElement;

    nameInput?.addEventListener('input', () => {
      this.createFormValues.name = nameInput.value;
    });
    descInput?.addEventListener('input', () => {
      this.createFormValues.description = descInput.value;
    });
    typeSelect?.addEventListener('change', () => {
      if (typeSelect.value) {
        this.createFormValues.sceneType = typeSelect.value;
      } else {
        delete this.createFormValues.sceneType;
      }
    });
    moodInput?.addEventListener('input', () => {
      this.createFormValues.mood = moodInput.value;
    });
    stakesInput?.addEventListener('input', () => {
      this.createFormValues.stakes = stakesInput.value;
    });

    const createBtn = this.container.querySelector('[data-action="create"]');
    const cancelBtn = this.container.querySelector('[data-action="cancel-create"]');

    createBtn?.addEventListener('click', () => this.handleCreateScene());
    cancelBtn?.addEventListener('click', () => {
      this.viewMode = 'list';
      this.createFormValues = {};
      this.updateDOM();
    });
  }

  private async handleStartScene(): Promise<void> {
    if (!this.selectedSceneId) return;

    try {
      this.setLoading(true);
      await this.callbacks.onSceneStart(this.selectedSceneId, this.currentTurn);
    } catch (error) {
      console.error('[ScenePanel] Failed to start scene:', error);
    } finally {
      this.setLoading(false);
    }
  }

  private async handleCompleteScene(): Promise<void> {
    if (!this.currentScene) return;

    try {
      this.setLoading(true);
      await this.callbacks.onSceneComplete(this.currentScene.id, this.currentTurn);
    } catch (error) {
      console.error('[ScenePanel] Failed to complete scene:', error);
    } finally {
      this.setLoading(false);
    }
  }

  private async handleCreateScene(): Promise<void> {
    // Validate required fields
    if (!this.createFormValues.name?.trim()) {
      return;
    }

    const sceneData: CreateSceneDTO = {
      turn: this.currentTurn,
      name: this.createFormValues.name,
      autoUnlock: true, // Auto-unlock new scenes
    };

    if (this.createFormValues.description?.trim()) {
      sceneData.description = this.createFormValues.description;
    }
    if (this.createFormValues.sceneType) {
      sceneData.sceneType = this.createFormValues.sceneType;
    }
    if (this.createFormValues.mood?.trim()) {
      sceneData.mood = this.createFormValues.mood;
    }
    if (this.createFormValues.stakes?.trim()) {
      sceneData.stakes = this.createFormValues.stakes;
    }

    try {
      this.setLoading(true);
      await this.callbacks.onSceneCreate(sceneData);
      this.viewMode = 'list';
      this.createFormValues = {};
    } catch (error) {
      console.error('[ScenePanel] Failed to create scene:', error);
    } finally {
      this.setLoading(false);
    }
  }

  private formatConnectionType(type: ConnectionType): string {
    switch (type) {
      case 'path': return 'Path';
      case 'conditional': return 'Conditional';
      case 'hidden': return 'Hidden';
      case 'one-way': return 'One-way';
      case 'teleport': return 'Teleport';
      default: return type;
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private injectStyles(): void {
    if (document.getElementById('scene-panel-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'scene-panel-styles';
    styles.textContent = `
      .scene-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #111;
        border: 1px solid #333;
        border-radius: 6px;
        overflow: hidden;
      }

      .scene-panel.loading {
        opacity: 0.7;
        pointer-events: none;
      }

      .scene-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1rem;
        background: linear-gradient(135deg, #2d6a4f 0%, #40916c 100%);
        border-bottom: 1px solid #333;
      }

      .scene-header h3 {
        margin: 0;
        font-size: 0.95rem;
        color: white;
        font-weight: 600;
      }

      .scene-header-actions {
        display: flex;
        gap: 0.25rem;
      }

      .scene-header-btn {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        width: 24px;
        height: 24px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1rem;
        line-height: 1;
        transition: background 0.2s;
      }

      .scene-header-btn:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      /* Current Scene Indicator */
      .scene-current {
        padding: 0.75rem 1rem;
        background: linear-gradient(135deg, rgba(45, 106, 79, 0.2) 0%, rgba(64, 145, 108, 0.2) 100%);
        border-bottom: 1px solid #333;
      }

      .scene-current-empty {
        text-align: center;
        color: #666;
        font-style: italic;
      }

      .scene-current-indicator {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.35rem;
      }

      .scene-current-dot {
        width: 8px;
        height: 8px;
        background: #4ade80;
        border-radius: 50%;
        animation: pulse 2s ease-in-out infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      .scene-current-label {
        font-size: 0.75rem;
        color: #4ade80;
        text-transform: uppercase;
        font-weight: 600;
        letter-spacing: 0.05em;
      }

      .scene-current-name {
        font-size: 1rem;
        color: #e0e0e0;
        font-weight: 500;
        margin-bottom: 0.25rem;
      }

      .scene-current-mood {
        font-size: 0.8rem;
        color: #888;
        font-style: italic;
        margin-bottom: 0.5rem;
      }

      .scene-current-meta {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.75rem;
        color: #666;
        margin-bottom: 0.75rem;
      }

      /* Scene List */
      .scene-list {
        flex: 1;
        overflow-y: auto;
        max-height: 200px;
      }

      .scene-list-empty {
        padding: 1rem;
        text-align: center;
        color: #666;
        font-style: italic;
        font-size: 0.9rem;
      }

      .scene-list-section {
        border-bottom: 1px solid #2a2a2a;
      }

      .scene-list-section:last-child {
        border-bottom: none;
      }

      .scene-list-section-header {
        padding: 0.5rem 1rem;
        font-size: 0.7rem;
        color: #666;
        text-transform: uppercase;
        font-weight: 600;
        letter-spacing: 0.05em;
        background: #0a0a0a;
      }

      .scene-list-more {
        padding: 0.5rem 1rem;
        font-size: 0.8rem;
        color: #666;
        text-align: center;
      }

      .scene-item {
        padding: 0.6rem 1rem;
        border-bottom: 1px solid #1a1a1a;
        cursor: pointer;
        transition: background 0.2s;
      }

      .scene-item:last-child {
        border-bottom: none;
      }

      .scene-item:hover {
        background: #1a1a1a;
      }

      .scene-item.selected {
        background: #1f2f1f;
        border-left: 3px solid #40916c;
        padding-left: calc(1rem - 3px);
      }

      .scene-item.current {
        background: rgba(45, 106, 79, 0.15);
      }

      .scene-item:focus {
        outline: 2px solid #40916c;
        outline-offset: -2px;
      }

      .scene-item-history {
        opacity: 0.7;
      }

      .scene-item-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        margin-bottom: 0.25rem;
      }

      .scene-item-name {
        font-size: 0.85rem;
        color: #e0e0e0;
        font-weight: 500;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .scene-item-current-badge {
        font-size: 0.65rem;
        padding: 0.1rem 0.35rem;
        background: rgba(74, 222, 128, 0.2);
        color: #4ade80;
        border-radius: 3px;
        font-weight: 600;
        text-transform: uppercase;
      }

      .scene-item-desc {
        font-size: 0.75rem;
        color: #888;
        margin-bottom: 0.25rem;
        line-height: 1.3;
      }

      .scene-item-meta {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.7rem;
        color: #666;
      }

      .scene-item-events {
        color: #666;
      }

      /* Scene Type Badges */
      .scene-type-badge {
        font-size: 0.65rem;
        padding: 0.1rem 0.35rem;
        border-radius: 3px;
        font-weight: 500;
        text-transform: uppercase;
        background: rgba(102, 126, 234, 0.2);
        color: #667eea;
      }

      .scene-type-exploration { background: rgba(45, 106, 79, 0.2); color: #4ade80; }
      .scene-type-combat { background: rgba(220, 38, 38, 0.2); color: #f87171; }
      .scene-type-social { background: rgba(139, 92, 246, 0.2); color: #a78bfa; }
      .scene-type-puzzle { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
      .scene-type-rest { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
      .scene-type-transition { background: rgba(107, 114, 128, 0.2); color: #9ca3af; }

      /* Scene Status Badges */
      .scene-status-badge {
        font-size: 0.65rem;
        padding: 0.1rem 0.35rem;
        border-radius: 3px;
        font-weight: 500;
        text-transform: uppercase;
      }

      .status-active { background: rgba(74, 222, 128, 0.2); color: #4ade80; }
      .status-completed { background: rgba(107, 114, 128, 0.2); color: #9ca3af; }
      .status-abandoned { background: rgba(220, 38, 38, 0.2); color: #f87171; }

      /* Scene Details */
      .scene-details {
        flex: 1;
        padding: 0.75rem 1rem;
        overflow-y: auto;
        border-top: 1px solid #333;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .scene-details-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        color: #666;
        font-style: italic;
      }

      .scene-detail-row {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
      }

      .detail-label {
        flex: 0 0 70px;
        font-size: 0.75rem;
        color: #888;
        font-weight: 500;
      }

      .detail-value {
        flex: 1;
        font-size: 0.8rem;
        color: #e0e0e0;
      }

      .scene-description {
        flex-direction: column;
        gap: 0.25rem;
      }

      .scene-description .detail-value {
        padding: 0.4rem;
        background: #1a1a1a;
        border-radius: 4px;
        line-height: 1.4;
      }

      .scene-mood {
        font-style: italic;
        color: #a78bfa;
      }

      .scene-stakes {
        color: #fbbf24;
      }

      /* Connections */
      .scene-connections {
        margin-top: 0.5rem;
        padding-top: 0.5rem;
        border-top: 1px solid #2a2a2a;
      }

      .connection-list {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        margin-top: 0.35rem;
      }

      .connection-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.8rem;
        padding: 0.35rem;
        background: #1a1a1a;
        border-radius: 4px;
      }

      .connection-type {
        font-size: 0.65rem;
        padding: 0.1rem 0.35rem;
        border-radius: 3px;
        font-weight: 500;
        text-transform: uppercase;
      }

      .connection-type-path { background: rgba(74, 222, 128, 0.2); color: #4ade80; }
      .connection-type-conditional { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
      .connection-type-hidden { background: rgba(220, 38, 38, 0.2); color: #f87171; }
      .connection-type-one-way { background: rgba(139, 92, 246, 0.2); color: #a78bfa; }
      .connection-type-teleport { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }

      .connection-target {
        color: #e0e0e0;
        flex: 1;
      }

      .connection-desc {
        color: #666;
        font-size: 0.75rem;
      }

      /* Scene Actions */
      .scene-actions {
        margin-top: auto;
        padding-top: 0.5rem;
      }

      .scene-panel .btn {
        width: 100%;
        padding: 0.6rem 0.75rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 500;
        transition: all 0.2s;
      }

      .scene-panel .btn:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
      }

      .scene-panel .btn:active:not(:disabled) {
        transform: translateY(0);
      }

      .scene-panel .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .scene-panel .btn-start {
        background: linear-gradient(135deg, #2d6a4f 0%, #40916c 100%);
        color: white;
      }

      .scene-panel .btn-complete {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }

      .scene-panel .btn-create {
        background: linear-gradient(135deg, #2d6a4f 0%, #40916c 100%);
        color: white;
      }

      .scene-panel .btn-cancel {
        background: #333;
        color: #888;
        margin-top: 0.5rem;
      }

      /* Create Form */
      .scene-create-form {
        flex: 1;
        padding: 0.75rem 1rem;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .form-group label {
        font-size: 0.75rem;
        color: #888;
        font-weight: 500;
      }

      .form-input {
        width: 100%;
        padding: 0.5rem;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 4px;
        color: #e0e0e0;
        font-size: 0.85rem;
        font-family: inherit;
      }

      .form-input:focus {
        outline: none;
        border-color: #40916c;
      }

      .form-textarea {
        resize: vertical;
        min-height: 60px;
      }

      .form-actions {
        margin-top: auto;
        display: flex;
        flex-direction: column;
      }
    `;
    document.head.appendChild(styles);
  }
}

export default ScenePanel;
