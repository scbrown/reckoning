/**
 * Save/Load Modal Component
 *
 * Provides UI for game persistence:
 * - Save game with custom name
 * - Load from list of saved games
 * - Start new game
 * - Delete saves with confirmation
 */

import { gameService, type SaveSlot } from '../services/game/index.js';

export type ModalView = 'closed' | 'save' | 'load' | 'confirm-delete' | 'new-game';

export interface SaveLoadModalCallbacks {
  onSave?: (slot: SaveSlot) => void;
  onLoad?: (slot: SaveSlot) => void;
  onNewGame?: () => void;
  onDelete?: (slotId: string) => void;
  onClose?: () => void;
}

/**
 * Save/Load Modal Component
 */
export class SaveLoadModal {
  private container: HTMLElement;
  private overlay: HTMLElement;
  private modal: HTMLElement;
  private currentView: ModalView = 'closed';
  private saves: SaveSlot[] = [];
  private pendingDeleteSlot: SaveSlot | null = null;
  private callbacks: SaveLoadModalCallbacks;
  private gameId: string | null = null;

  constructor(callbacks: SaveLoadModalCallbacks = {}) {
    this.callbacks = callbacks;
    this.container = this.createContainer();
    this.overlay = this.createOverlay();
    this.modal = this.createModal();
    this.container.appendChild(this.overlay);
    this.container.appendChild(this.modal);
    this.injectStyles();
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Mount the modal to the DOM
   */
  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.container);
  }

  /**
   * Unmount the modal from the DOM
   */
  unmount(): void {
    this.container.remove();
  }

  /**
   * Set the current game ID for save/load operations
   */
  setGameId(gameId: string | null): void {
    this.gameId = gameId;
  }

  /**
   * Open the save modal
   */
  async openSave(): Promise<void> {
    this.currentView = 'save';
    this.render();
    this.show();
  }

  /**
   * Open the load modal
   */
  async openLoad(): Promise<void> {
    this.currentView = 'load';
    await this.refreshSaves();
    this.render();
    this.show();
  }

  /**
   * Open the new game modal
   */
  openNewGame(): void {
    this.currentView = 'new-game';
    this.render();
    this.show();
  }

  /**
   * Close the modal
   */
  close(): void {
    this.hide();
    this.currentView = 'closed';
    this.pendingDeleteSlot = null;
    this.callbacks.onClose?.();
  }

  // ===========================================================================
  // Private: DOM Creation
  // ===========================================================================

  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'save-load-modal-container';
    container.style.display = 'none';
    return container;
  }

  private createOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'save-load-modal-overlay';
    overlay.addEventListener('click', () => this.close());
    return overlay;
  }

  private createModal(): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'save-load-modal';
    modal.addEventListener('click', (e) => e.stopPropagation());
    return modal;
  }

  private injectStyles(): void {
    if (document.getElementById('save-load-modal-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'save-load-modal-styles';
    styles.textContent = `
      .save-load-modal-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .save-load-modal-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
      }

      .save-load-modal {
        position: relative;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 1.5rem;
        min-width: 400px;
        max-width: 500px;
        max-height: 80vh;
        overflow-y: auto;
      }

      .save-load-modal h2 {
        font-size: 1.4rem;
        margin-bottom: 1rem;
        color: #e0e0e0;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .save-load-modal .modal-section {
        margin-bottom: 1rem;
      }

      .save-load-modal label {
        display: block;
        font-size: 0.9rem;
        color: #888;
        margin-bottom: 0.5rem;
      }

      .save-load-modal input[type="text"] {
        width: 100%;
        padding: 0.75rem;
        background: #222;
        border: 1px solid #444;
        border-radius: 4px;
        color: #e0e0e0;
        font-size: 1rem;
      }

      .save-load-modal input[type="text"]:focus {
        outline: none;
        border-color: #667eea;
      }

      .save-load-modal .button-row {
        display: flex;
        gap: 0.5rem;
        justify-content: flex-end;
        margin-top: 1.5rem;
      }

      .save-load-modal button {
        padding: 0.6rem 1.2rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.9rem;
        transition: opacity 0.2s;
      }

      .save-load-modal button:hover {
        opacity: 0.9;
      }

      .save-load-modal button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .save-load-modal .btn-primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }

      .save-load-modal .btn-secondary {
        background: #333;
        color: #e0e0e0;
      }

      .save-load-modal .btn-danger {
        background: #dc2626;
        color: white;
      }

      .save-load-modal .btn-success {
        background: #16a34a;
        color: white;
      }

      .save-load-modal .saves-list {
        max-height: 300px;
        overflow-y: auto;
      }

      .save-load-modal .save-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem;
        background: #222;
        border: 1px solid #333;
        border-radius: 4px;
        margin-bottom: 0.5rem;
      }

      .save-load-modal .save-item:hover {
        border-color: #444;
      }

      .save-load-modal .save-info {
        flex: 1;
      }

      .save-load-modal .save-name {
        font-size: 1rem;
        color: #e0e0e0;
        margin-bottom: 0.25rem;
      }

      .save-load-modal .save-details {
        font-size: 0.8rem;
        color: #666;
      }

      .save-load-modal .save-actions {
        display: flex;
        gap: 0.5rem;
      }

      .save-load-modal .save-actions button {
        padding: 0.4rem 0.8rem;
        font-size: 0.8rem;
      }

      .save-load-modal .empty-message {
        text-align: center;
        padding: 2rem;
        color: #666;
        font-style: italic;
      }

      .save-load-modal .new-game-section {
        border-top: 1px solid #333;
        padding-top: 1rem;
        margin-top: 1rem;
      }

      .save-load-modal .confirm-message {
        font-size: 1rem;
        color: #e0e0e0;
        margin-bottom: 0.5rem;
      }

      .save-load-modal .confirm-details {
        font-size: 0.9rem;
        color: #888;
        margin-bottom: 1rem;
      }

      .save-load-modal .error-message {
        color: #f87171;
        font-size: 0.9rem;
        margin-top: 0.5rem;
      }
    `;
    document.head.appendChild(styles);
  }

  // ===========================================================================
  // Private: Rendering
  // ===========================================================================

  private render(): void {
    switch (this.currentView) {
      case 'save':
        this.renderSaveView();
        break;
      case 'load':
        this.renderLoadView();
        break;
      case 'confirm-delete':
        this.renderConfirmDeleteView();
        break;
      case 'new-game':
        this.renderNewGameView();
        break;
      default:
        this.modal.innerHTML = '';
    }
  }

  private renderSaveView(): void {
    this.modal.innerHTML = `
      <h2>Save Game</h2>
      <div class="modal-section">
        <label for="save-name-input">Save Name</label>
        <input type="text" id="save-name-input" placeholder="Enter a name for your save..." autofocus />
        <div id="save-error" class="error-message" style="display: none;"></div>
      </div>
      <div class="button-row">
        <button class="btn-secondary" id="save-cancel-btn">Cancel</button>
        <button class="btn-primary" id="save-confirm-btn">Save</button>
      </div>
    `;

    const input = this.modal.querySelector('#save-name-input') as HTMLInputElement;
    const cancelBtn = this.modal.querySelector('#save-cancel-btn') as HTMLButtonElement;
    const confirmBtn = this.modal.querySelector('#save-confirm-btn') as HTMLButtonElement;

    cancelBtn.addEventListener('click', () => this.close());
    confirmBtn.addEventListener('click', () => this.handleSave(input.value.trim()));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleSave(input.value.trim());
      }
    });

    // Focus the input after rendering
    setTimeout(() => input.focus(), 50);
  }

  private renderLoadView(): void {
    const savesHtml = this.saves.length > 0
      ? this.saves.map((save) => this.renderSaveItem(save)).join('')
      : '<div class="empty-message">No saved games found</div>';

    this.modal.innerHTML = `
      <h2>Load Game</h2>
      <div class="saves-list">
        ${savesHtml}
      </div>
      <div class="new-game-section">
        <button class="btn-success" id="new-game-btn" style="width: 100%;">Start New Game</button>
      </div>
      <div class="button-row">
        <button class="btn-secondary" id="load-cancel-btn">Cancel</button>
      </div>
    `;

    // Attach load button handlers
    this.saves.forEach((save) => {
      const loadBtn = this.modal.querySelector(`#load-btn-${save.id}`) as HTMLButtonElement;
      const deleteBtn = this.modal.querySelector(`#delete-btn-${save.id}`) as HTMLButtonElement;

      loadBtn?.addEventListener('click', () => this.handleLoad(save));
      deleteBtn?.addEventListener('click', () => this.showDeleteConfirmation(save));
    });

    const newGameBtn = this.modal.querySelector('#new-game-btn') as HTMLButtonElement;
    const cancelBtn = this.modal.querySelector('#load-cancel-btn') as HTMLButtonElement;

    newGameBtn.addEventListener('click', () => this.handleNewGameClick());
    cancelBtn.addEventListener('click', () => this.close());
  }

  private renderSaveItem(save: SaveSlot): string {
    const date = new Date(save.createdAt).toLocaleString();
    return `
      <div class="save-item">
        <div class="save-info">
          <div class="save-name">${this.escapeHtml(save.name)}</div>
          <div class="save-details">Turn ${save.turn} &middot; ${this.escapeHtml(save.location)} &middot; ${date}</div>
        </div>
        <div class="save-actions">
          <button class="btn-primary" id="load-btn-${save.id}">Load</button>
          <button class="btn-danger" id="delete-btn-${save.id}">Delete</button>
        </div>
      </div>
    `;
  }

  private renderConfirmDeleteView(): void {
    if (!this.pendingDeleteSlot) {
      this.currentView = 'load';
      this.render();
      return;
    }

    const save = this.pendingDeleteSlot;
    this.modal.innerHTML = `
      <h2>Delete Save</h2>
      <p class="confirm-message">Are you sure you want to delete this save?</p>
      <p class="confirm-details">"${this.escapeHtml(save.name)}" - Turn ${save.turn} at ${this.escapeHtml(save.location)}</p>
      <div class="button-row">
        <button class="btn-secondary" id="delete-cancel-btn">Cancel</button>
        <button class="btn-danger" id="delete-confirm-btn">Delete</button>
      </div>
    `;

    const cancelBtn = this.modal.querySelector('#delete-cancel-btn') as HTMLButtonElement;
    const confirmBtn = this.modal.querySelector('#delete-confirm-btn') as HTMLButtonElement;

    cancelBtn.addEventListener('click', () => {
      this.pendingDeleteSlot = null;
      this.currentView = 'load';
      this.render();
    });
    confirmBtn.addEventListener('click', () => this.handleDelete());
  }

  private renderNewGameView(): void {
    this.modal.innerHTML = `
      <h2>New Game</h2>
      <div class="modal-section">
        <label for="player-name-input">Character Name</label>
        <input type="text" id="player-name-input" placeholder="Enter your character's name..." autofocus />
      </div>
      <div class="modal-section">
        <label for="player-desc-input">Character Description (optional)</label>
        <input type="text" id="player-desc-input" placeholder="A brief description of your character..." />
        <div id="new-game-error" class="error-message" style="display: none;"></div>
      </div>
      <div class="button-row">
        <button class="btn-secondary" id="new-game-cancel-btn">Cancel</button>
        <button class="btn-success" id="new-game-start-btn">Start Game</button>
      </div>
    `;

    const nameInput = this.modal.querySelector('#player-name-input') as HTMLInputElement;
    const descInput = this.modal.querySelector('#player-desc-input') as HTMLInputElement;
    const cancelBtn = this.modal.querySelector('#new-game-cancel-btn') as HTMLButtonElement;
    const startBtn = this.modal.querySelector('#new-game-start-btn') as HTMLButtonElement;

    cancelBtn.addEventListener('click', () => this.close());
    startBtn.addEventListener('click', () => this.handleStartNewGame(nameInput.value.trim(), descInput.value.trim()));
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleStartNewGame(nameInput.value.trim(), descInput.value.trim());
      }
    });

    setTimeout(() => nameInput.focus(), 50);
  }

  // ===========================================================================
  // Private: Handlers
  // ===========================================================================

  private async handleSave(name: string): Promise<void> {
    const errorEl = this.modal.querySelector('#save-error') as HTMLElement;
    const confirmBtn = this.modal.querySelector('#save-confirm-btn') as HTMLButtonElement;

    if (!name) {
      errorEl.textContent = 'Please enter a name for your save';
      errorEl.style.display = 'block';
      return;
    }

    if (!this.gameId) {
      errorEl.textContent = 'No active game to save';
      errorEl.style.display = 'block';
      return;
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Saving...';

    try {
      const slot = await gameService.saveGame(this.gameId, name);
      this.callbacks.onSave?.(slot);
      this.close();
    } catch (error) {
      errorEl.textContent = error instanceof Error ? error.message : 'Failed to save game';
      errorEl.style.display = 'block';
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Save';
    }
  }

  private async handleLoad(save: SaveSlot): Promise<void> {
    const loadBtn = this.modal.querySelector(`#load-btn-${save.id}`) as HTMLButtonElement;
    loadBtn.disabled = true;
    loadBtn.textContent = 'Loading...';

    try {
      await gameService.loadGame(save.gameId, save.id);
      this.callbacks.onLoad?.(save);
      this.close();
    } catch (error) {
      console.error('Failed to load game:', error);
      loadBtn.disabled = false;
      loadBtn.textContent = 'Load';
    }
  }

  private showDeleteConfirmation(save: SaveSlot): void {
    this.pendingDeleteSlot = save;
    this.currentView = 'confirm-delete';
    this.render();
  }

  private async handleDelete(): Promise<void> {
    if (!this.pendingDeleteSlot) return;

    const confirmBtn = this.modal.querySelector('#delete-confirm-btn') as HTMLButtonElement;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting...';

    const slotId = this.pendingDeleteSlot.id;

    try {
      // Note: deleteSave API will be added to GameService
      // For now, we call the callback and let the parent handle it
      this.callbacks.onDelete?.(slotId);

      // Remove from local list
      this.saves = this.saves.filter((s) => s.id !== slotId);
      this.pendingDeleteSlot = null;
      this.currentView = 'load';
      this.render();
    } catch (error) {
      console.error('Failed to delete save:', error);
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Delete';
    }
  }

  private handleNewGameClick(): void {
    this.currentView = 'new-game';
    this.render();
  }

  private async handleStartNewGame(name: string, description: string): Promise<void> {
    const errorEl = this.modal.querySelector('#new-game-error') as HTMLElement;
    const startBtn = this.modal.querySelector('#new-game-start-btn') as HTMLButtonElement;

    if (!name) {
      errorEl.textContent = 'Please enter a character name';
      errorEl.style.display = 'block';
      return;
    }

    startBtn.disabled = true;
    startBtn.textContent = 'Starting...';

    try {
      await gameService.newGame(name, description || undefined);
      this.callbacks.onNewGame?.();
      this.close();
    } catch (error) {
      errorEl.textContent = error instanceof Error ? error.message : 'Failed to start new game';
      errorEl.style.display = 'block';
      startBtn.disabled = false;
      startBtn.textContent = 'Start Game';
    }
  }

  // ===========================================================================
  // Private: Utilities
  // ===========================================================================

  private async refreshSaves(): Promise<void> {
    try {
      this.saves = await gameService.listSaves();
    } catch (error) {
      console.error('Failed to fetch saves:', error);
      this.saves = [];
    }
  }

  private show(): void {
    this.container.style.display = 'flex';
  }

  private hide(): void {
    this.container.style.display = 'none';
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

/**
 * Create and mount a save/load modal instance
 */
export function createSaveLoadModal(callbacks: SaveLoadModalCallbacks = {}): SaveLoadModal {
  const modal = new SaveLoadModal(callbacks);
  modal.mount();
  return modal;
}
