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

export type ModalView = 'closed' | 'save' | 'load' | 'confirm-delete' | 'new-game' | 'add-party' | 'generate-world' | 'dm-review';

export interface SaveLoadModalCallbacks {
  onSave?: (slot: SaveSlot) => void;
  onLoad?: (slot: SaveSlot) => void;
  onNewGame?: (playerName: string, description?: string) => Promise<void>;
  onDelete?: (slotId: string) => void;
  onClose?: () => void;
}

/**
 * Save/Load Modal Component
 */
interface PartyMember {
  name: string;
  description: string;
  class: string;
}

interface WorldSettings {
  theme: string;
  tone: string;
  startingLocation: string;
}

interface NewGameWizardState {
  playerName: string;
  playerDescription: string;
  partyMembers: PartyMember[];
  worldSettings: WorldSettings;
  generatedWorldPreview: string | null;
  isGenerating: boolean;
}

export class SaveLoadModal {
  private container: HTMLElement;
  private overlay: HTMLElement;
  private modal: HTMLElement;
  private currentView: ModalView = 'closed';
  private saves: SaveSlot[] = [];
  private pendingDeleteSlot: SaveSlot | null = null;
  private callbacks: SaveLoadModalCallbacks;
  private gameId: string | null = null;
  private previouslyFocusedElement: HTMLElement | null = null;
  private boundKeydownHandler: (e: KeyboardEvent) => void;
  private wizardState: NewGameWizardState = {
    playerName: '',
    playerDescription: '',
    partyMembers: [],
    worldSettings: {
      theme: 'fantasy',
      tone: 'balanced',
      startingLocation: '',
    },
    generatedWorldPreview: null,
    isGenerating: false,
  };

  constructor(callbacks: SaveLoadModalCallbacks = {}) {
    this.callbacks = callbacks;
    this.boundKeydownHandler = this.handleKeydown.bind(this);
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
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'save-load-modal-title');
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

      /* Wizard Progress Indicator */
      .save-load-modal .wizard-progress {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid #333;
      }

      .save-load-modal .wizard-step {
        font-size: 0.75rem;
        color: #555;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        background: #222;
      }

      .save-load-modal .wizard-step.active {
        color: #667eea;
        background: rgba(102, 126, 234, 0.1);
        border: 1px solid #667eea;
      }

      .save-load-modal .wizard-step.completed {
        color: #16a34a;
        background: rgba(22, 163, 74, 0.1);
      }

      /* Party Member List */
      .save-load-modal .party-list {
        max-height: 150px;
        overflow-y: auto;
        margin-bottom: 1rem;
      }

      .save-load-modal .party-member-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem;
        background: #222;
        border: 1px solid #333;
        border-radius: 4px;
        margin-bottom: 0.5rem;
      }

      .save-load-modal .party-member-info {
        flex: 1;
      }

      .save-load-modal .party-member-name {
        font-size: 0.9rem;
        color: #e0e0e0;
      }

      .save-load-modal .party-member-details {
        font-size: 0.75rem;
        color: #666;
      }

      .save-load-modal .btn-small {
        padding: 0.25rem 0.5rem;
        font-size: 0.75rem;
      }

      /* Add Member Form */
      .save-load-modal .add-member-form {
        background: #222;
        padding: 0.75rem;
        border-radius: 4px;
        border: 1px solid #333;
      }

      .save-load-modal .form-row {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
      }

      .save-load-modal .form-row:last-child {
        margin-bottom: 0;
      }

      .save-load-modal .form-row input {
        flex: 1;
      }

      .save-load-modal .help-text {
        font-size: 0.8rem;
        color: #666;
        margin-bottom: 0.75rem;
      }

      /* Select Inputs */
      .save-load-modal select {
        width: 100%;
        padding: 0.75rem;
        background: #222;
        border: 1px solid #444;
        border-radius: 4px;
        color: #e0e0e0;
        font-size: 1rem;
        cursor: pointer;
      }

      .save-load-modal select:focus {
        outline: none;
        border-color: #667eea;
      }

      /* Review Section */
      .save-load-modal .review-section {
        background: #222;
        padding: 0.75rem;
        border-radius: 4px;
        margin-bottom: 0.75rem;
      }

      .save-load-modal .review-section label {
        font-size: 0.75rem;
        color: #667eea;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 0.25rem;
      }

      .save-load-modal .review-value {
        font-size: 0.9rem;
        color: #e0e0e0;
      }

      .save-load-modal .review-preview {
        font-size: 0.9rem;
        color: #e0e0e0;
        font-style: italic;
        line-height: 1.5;
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
      case 'add-party':
        this.renderAddPartyView();
        break;
      case 'generate-world':
        this.renderGenerateWorldView();
        break;
      case 'dm-review':
        this.renderDMReviewView();
        break;
      default:
        this.modal.innerHTML = '';
    }
  }

  private renderSaveView(): void {
    this.modal.innerHTML = `
      <h2 id="save-load-modal-title">Save Game</h2>
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
      <h2 id="save-load-modal-title">Load Game</h2>
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
      <h2 id="save-load-modal-title">Delete Save</h2>
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
      <h2 id="save-load-modal-title">New Game - Create Character</h2>
      <div class="wizard-progress">
        <span class="wizard-step active">1. Character</span>
        <span class="wizard-step">2. Party</span>
        <span class="wizard-step">3. World</span>
        <span class="wizard-step">4. Review</span>
      </div>
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
        <button class="btn-primary" id="new-game-next-btn">Next: Add Party</button>
      </div>
    `;

    const nameInput = this.modal.querySelector('#player-name-input') as HTMLInputElement;
    const descInput = this.modal.querySelector('#player-desc-input') as HTMLInputElement;
    const cancelBtn = this.modal.querySelector('#new-game-cancel-btn') as HTMLButtonElement;
    const nextBtn = this.modal.querySelector('#new-game-next-btn') as HTMLButtonElement;

    // Restore previous values if going back
    nameInput.value = this.wizardState.playerName;
    descInput.value = this.wizardState.playerDescription;

    cancelBtn.addEventListener('click', () => {
      this.resetWizardState();
      this.close();
    });
    nextBtn.addEventListener('click', () => this.handleCharacterNext(nameInput.value.trim(), descInput.value.trim()));
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleCharacterNext(nameInput.value.trim(), descInput.value.trim());
      }
    });

    setTimeout(() => nameInput.focus(), 50);
  }

  private handleCharacterNext(name: string, description: string): void {
    const errorEl = this.modal.querySelector('#new-game-error') as HTMLElement;

    if (!name) {
      errorEl.textContent = 'Please enter a character name';
      errorEl.style.display = 'block';
      return;
    }

    // Save to wizard state
    this.wizardState.playerName = name;
    this.wizardState.playerDescription = description;

    // Proceed to party step
    this.currentView = 'add-party';
    this.render();
  }

  private renderAddPartyView(): void {
    const partyHtml = this.wizardState.partyMembers.length > 0
      ? this.wizardState.partyMembers.map((member, idx) => `
        <div class="party-member-item">
          <div class="party-member-info">
            <div class="party-member-name">${this.escapeHtml(member.name)}</div>
            <div class="party-member-details">${this.escapeHtml(member.class)} - ${this.escapeHtml(member.description || 'No description')}</div>
          </div>
          <button class="btn-danger btn-small" data-remove-idx="${idx}">Remove</button>
        </div>
      `).join('')
      : '<div class="empty-message">No party members added yet (optional)</div>';

    this.modal.innerHTML = `
      <h2 id="save-load-modal-title">New Game - Add Party</h2>
      <div class="wizard-progress">
        <span class="wizard-step completed">1. Character</span>
        <span class="wizard-step active">2. Party</span>
        <span class="wizard-step">3. World</span>
        <span class="wizard-step">4. Review</span>
      </div>
      <div class="modal-section">
        <label>Party Members (Optional)</label>
        <p class="help-text">Add companions to join your adventure. You can skip this step to adventure alone.</p>
        <div class="party-list">${partyHtml}</div>
      </div>
      <div class="modal-section add-member-form">
        <div class="form-row">
          <input type="text" id="member-name-input" placeholder="Member name..." />
          <input type="text" id="member-class-input" placeholder="Class..." />
        </div>
        <div class="form-row">
          <input type="text" id="member-desc-input" placeholder="Description (optional)..." style="flex: 1;" />
          <button class="btn-secondary" id="add-member-btn">Add</button>
        </div>
      </div>
      <div class="button-row">
        <button class="btn-secondary" id="party-back-btn">Back</button>
        <button class="btn-primary" id="party-next-btn">Next: Generate World</button>
      </div>
    `;

    // Attach remove handlers
    this.wizardState.partyMembers.forEach((_, idx) => {
      const removeBtn = this.modal.querySelector(`[data-remove-idx="${idx}"]`) as HTMLButtonElement;
      removeBtn?.addEventListener('click', () => {
        this.wizardState.partyMembers.splice(idx, 1);
        this.render();
      });
    });

    const nameInput = this.modal.querySelector('#member-name-input') as HTMLInputElement;
    const classInput = this.modal.querySelector('#member-class-input') as HTMLInputElement;
    const descInput = this.modal.querySelector('#member-desc-input') as HTMLInputElement;
    const addBtn = this.modal.querySelector('#add-member-btn') as HTMLButtonElement;
    const backBtn = this.modal.querySelector('#party-back-btn') as HTMLButtonElement;
    const nextBtn = this.modal.querySelector('#party-next-btn') as HTMLButtonElement;

    addBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      const memberClass = classInput.value.trim();
      const desc = descInput.value.trim();

      if (name && memberClass) {
        this.wizardState.partyMembers.push({ name, class: memberClass, description: desc });
        this.render();
      }
    });

    backBtn.addEventListener('click', () => {
      this.currentView = 'new-game';
      this.render();
    });

    nextBtn.addEventListener('click', () => {
      this.currentView = 'generate-world';
      this.render();
    });

    setTimeout(() => nameInput.focus(), 50);
  }

  private renderGenerateWorldView(): void {
    const isGenerating = this.wizardState.isGenerating;

    this.modal.innerHTML = `
      <h2 id="save-load-modal-title">New Game - Generate World</h2>
      <div class="wizard-progress">
        <span class="wizard-step completed">1. Character</span>
        <span class="wizard-step completed">2. Party</span>
        <span class="wizard-step active">3. World</span>
        <span class="wizard-step">4. Review</span>
      </div>
      <div class="modal-section">
        <label for="world-theme-select">World Theme</label>
        <select id="world-theme-select">
          <option value="fantasy" ${this.wizardState.worldSettings.theme === 'fantasy' ? 'selected' : ''}>Fantasy</option>
          <option value="dark-fantasy" ${this.wizardState.worldSettings.theme === 'dark-fantasy' ? 'selected' : ''}>Dark Fantasy</option>
          <option value="horror" ${this.wizardState.worldSettings.theme === 'horror' ? 'selected' : ''}>Horror</option>
          <option value="sci-fi" ${this.wizardState.worldSettings.theme === 'sci-fi' ? 'selected' : ''}>Science Fiction</option>
          <option value="post-apocalyptic" ${this.wizardState.worldSettings.theme === 'post-apocalyptic' ? 'selected' : ''}>Post-Apocalyptic</option>
        </select>
      </div>
      <div class="modal-section">
        <label for="world-tone-select">Narrative Tone</label>
        <select id="world-tone-select">
          <option value="heroic" ${this.wizardState.worldSettings.tone === 'heroic' ? 'selected' : ''}>Heroic</option>
          <option value="balanced" ${this.wizardState.worldSettings.tone === 'balanced' ? 'selected' : ''}>Balanced</option>
          <option value="gritty" ${this.wizardState.worldSettings.tone === 'gritty' ? 'selected' : ''}>Gritty</option>
          <option value="comedic" ${this.wizardState.worldSettings.tone === 'comedic' ? 'selected' : ''}>Comedic</option>
        </select>
      </div>
      <div class="modal-section">
        <label for="starting-location-input">Starting Location (optional)</label>
        <input type="text" id="starting-location-input" placeholder="e.g., A tavern in a small village..." value="${this.escapeHtml(this.wizardState.worldSettings.startingLocation)}" />
      </div>
      <div id="world-error" class="error-message" style="display: none;"></div>
      <div class="button-row">
        <button class="btn-secondary" id="world-back-btn" ${isGenerating ? 'disabled' : ''}>Back</button>
        <button class="btn-primary" id="world-generate-btn" ${isGenerating ? 'disabled' : ''}>
          ${isGenerating ? 'Generating...' : 'Generate World'}
        </button>
      </div>
    `;

    const themeSelect = this.modal.querySelector('#world-theme-select') as HTMLSelectElement;
    const toneSelect = this.modal.querySelector('#world-tone-select') as HTMLSelectElement;
    const locationInput = this.modal.querySelector('#starting-location-input') as HTMLInputElement;
    const backBtn = this.modal.querySelector('#world-back-btn') as HTMLButtonElement;
    const generateBtn = this.modal.querySelector('#world-generate-btn') as HTMLButtonElement;

    themeSelect.addEventListener('change', () => {
      this.wizardState.worldSettings.theme = themeSelect.value;
    });

    toneSelect.addEventListener('change', () => {
      this.wizardState.worldSettings.tone = toneSelect.value;
    });

    locationInput.addEventListener('input', () => {
      this.wizardState.worldSettings.startingLocation = locationInput.value;
    });

    backBtn.addEventListener('click', () => {
      this.currentView = 'add-party';
      this.render();
    });

    generateBtn.addEventListener('click', () => this.handleGenerateWorld());
  }

  private async handleGenerateWorld(): Promise<void> {
    const errorEl = this.modal.querySelector('#world-error') as HTMLElement;
    const generateBtn = this.modal.querySelector('#world-generate-btn') as HTMLButtonElement;

    this.wizardState.isGenerating = true;
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';

    try {
      // Generate world preview based on settings
      const { theme, tone, startingLocation } = this.wizardState.worldSettings;
      const preview = this.generateWorldPreview(theme, tone, startingLocation);
      this.wizardState.generatedWorldPreview = preview;

      // Proceed to DM review
      this.wizardState.isGenerating = false;
      this.currentView = 'dm-review';
      this.render();
    } catch (error) {
      errorEl.textContent = error instanceof Error ? error.message : 'Failed to generate world';
      errorEl.style.display = 'block';
      this.wizardState.isGenerating = false;
      generateBtn.disabled = false;
      generateBtn.textContent = 'Generate World';
    }
  }

  private generateWorldPreview(theme: string, tone: string, startingLocation: string): string {
    const themeDescriptions: Record<string, string> = {
      'fantasy': 'a world of magic, mythical creatures, and ancient kingdoms',
      'dark-fantasy': 'a grim world where darkness lurks and hope is scarce',
      'horror': 'a world of supernatural terror and unspeakable horrors',
      'sci-fi': 'a universe of advanced technology and interstellar exploration',
      'post-apocalyptic': 'the remnants of a fallen civilization struggling to survive',
    };

    const toneDescriptions: Record<string, string> = {
      'heroic': 'where heroes rise to meet great challenges',
      'balanced': 'where both triumph and tragedy await',
      'gritty': 'where survival comes at a cost',
      'comedic': 'where adventure is seasoned with humor',
    };

    const location = startingLocation || 'an unknown location';
    return `Your adventure begins in ${themeDescriptions[theme] || theme}, ${toneDescriptions[tone] || tone}. You find yourself at ${location}, ready to forge your destiny.`;
  }

  private renderDMReviewView(): void {
    const playerInfo = `${this.wizardState.playerName}${this.wizardState.playerDescription ? ` - ${this.wizardState.playerDescription}` : ''}`;
    const partyInfo = this.wizardState.partyMembers.length > 0
      ? this.wizardState.partyMembers.map(m => `${m.name} (${m.class})`).join(', ')
      : 'Solo adventure';

    this.modal.innerHTML = `
      <h2 id="save-load-modal-title">New Game - DM Review</h2>
      <div class="wizard-progress">
        <span class="wizard-step completed">1. Character</span>
        <span class="wizard-step completed">2. Party</span>
        <span class="wizard-step completed">3. World</span>
        <span class="wizard-step active">4. Review</span>
      </div>
      <div class="modal-section review-section">
        <label>Your Character</label>
        <div class="review-value">${this.escapeHtml(playerInfo)}</div>
      </div>
      <div class="modal-section review-section">
        <label>Party</label>
        <div class="review-value">${this.escapeHtml(partyInfo)}</div>
      </div>
      <div class="modal-section review-section">
        <label>World Settings</label>
        <div class="review-value">Theme: ${this.escapeHtml(this.wizardState.worldSettings.theme)} | Tone: ${this.escapeHtml(this.wizardState.worldSettings.tone)}</div>
      </div>
      <div class="modal-section review-section">
        <label>World Preview</label>
        <div class="review-preview">${this.escapeHtml(this.wizardState.generatedWorldPreview || '')}</div>
      </div>
      <div id="dm-review-error" class="error-message" style="display: none;"></div>
      <div class="button-row">
        <button class="btn-secondary" id="review-back-btn">Back</button>
        <button class="btn-success" id="review-begin-btn">Begin Adventure</button>
      </div>
    `;

    const backBtn = this.modal.querySelector('#review-back-btn') as HTMLButtonElement;
    const beginBtn = this.modal.querySelector('#review-begin-btn') as HTMLButtonElement;

    backBtn.addEventListener('click', () => {
      this.currentView = 'generate-world';
      this.render();
    });

    beginBtn.addEventListener('click', () => this.handleBeginAdventure());
  }

  private async handleBeginAdventure(): Promise<void> {
    const errorEl = this.modal.querySelector('#dm-review-error') as HTMLElement;
    const beginBtn = this.modal.querySelector('#review-begin-btn') as HTMLButtonElement;

    beginBtn.disabled = true;
    beginBtn.textContent = 'Starting...';

    try {
      // Create the game with all the wizard state
      await gameService.newGame(
        this.wizardState.playerName,
        this.wizardState.playerDescription || undefined
      );

      this.callbacks.onNewGame?.(this.wizardState.playerName, this.wizardState.playerDescription || undefined);
      this.resetWizardState();
      this.close();
    } catch (error) {
      errorEl.textContent = error instanceof Error ? error.message : 'Failed to start game';
      errorEl.style.display = 'block';
      beginBtn.disabled = false;
      beginBtn.textContent = 'Begin Adventure';
    }
  }

  private resetWizardState(): void {
    this.wizardState = {
      playerName: '',
      playerDescription: '',
      partyMembers: [],
      worldSettings: {
        theme: 'fantasy',
        tone: 'balanced',
        startingLocation: '',
      },
      generatedWorldPreview: null,
      isGenerating: false,
    };
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
    this.resetWizardState();
    this.currentView = 'new-game';
    this.render();
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
    // Store the currently focused element to restore later
    this.previouslyFocusedElement = document.activeElement as HTMLElement;

    this.container.style.display = 'flex';

    // Add keyboard event listener for focus trap and escape key
    document.addEventListener('keydown', this.boundKeydownHandler);

    // Focus the first focusable element in the modal
    requestAnimationFrame(() => {
      this.focusFirstElement();
    });
  }

  private hide(): void {
    this.container.style.display = 'none';

    // Remove keyboard event listener
    document.removeEventListener('keydown', this.boundKeydownHandler);

    // Restore focus to the previously focused element
    if (this.previouslyFocusedElement && this.previouslyFocusedElement.focus) {
      this.previouslyFocusedElement.focus();
    }
    this.previouslyFocusedElement = null;
  }

  private handleKeydown(e: KeyboardEvent): void {
    // Close on Escape key
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }

    // Focus trap on Tab key
    if (e.key === 'Tab') {
      this.trapFocus(e);
    }
  }

  private getFocusableElements(): HTMLElement[] {
    const focusableSelectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ');

    return Array.from(this.modal.querySelectorAll<HTMLElement>(focusableSelectors));
  }

  private focusFirstElement(): void {
    const focusableElements = this.getFocusableElements();
    const firstElement = focusableElements[0];
    if (firstElement) {
      firstElement.focus();
    } else {
      // If no focusable elements, focus the modal itself
      this.modal.setAttribute('tabindex', '-1');
      this.modal.focus();
    }
  }

  private trapFocus(e: KeyboardEvent): void {
    const focusableElements = this.getFocusableElements();
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (!firstElement || !lastElement) return;

    if (e.shiftKey) {
      // Shift + Tab: if on first element, go to last
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab: if on last element, go to first
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
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
