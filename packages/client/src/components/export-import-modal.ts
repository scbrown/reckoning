/**
 * Export/Import Modal Component
 *
 * Provides UI for:
 * - Exporting game to JSON format with configurable options
 * - Previewing export metadata before download
 * - Git integration status display
 * - Importing games from JSON files
 */

export type ExportModalView = 'closed' | 'export' | 'export-preview' | 'import' | 'import-confirm' | 'git-status';

export interface ExportOptions {
  includeEvents: boolean;
  eventLimit: number | null;
  includePending: boolean;
  includeNotifications: boolean;
  compressed: boolean;
}

export interface ExportPreview {
  gameId: string;
  turn: number;
  createdAt: string;
  updatedAt: string;
  counts: {
    events: number;
    scenes: number;
    relationships: number;
    traits: number;
    pendingEvolutions: number;
    emergenceNotifications: number;
    areas: number;
    npcs: number;
  };
}

export interface ExportImportModalCallbacks {
  onExport?: (options: ExportOptions) => Promise<void>;
  onImport?: (file: File) => Promise<void>;
  onClose?: () => void;
}

/**
 * Export/Import Modal Component
 */
export class ExportImportModal {
  private container: HTMLElement;
  private overlay: HTMLElement;
  private modal: HTMLElement;
  private currentView: ExportModalView = 'closed';
  private callbacks: ExportImportModalCallbacks;
  private gameId: string | null = null;
  private previouslyFocusedElement: HTMLElement | null = null;
  private boundKeydownHandler: (e: KeyboardEvent) => void;

  // Export state
  private exportOptions: ExportOptions = {
    includeEvents: true,
    eventLimit: null,
    includePending: true,
    includeNotifications: true,
    compressed: false,
  };
  private exportPreview: ExportPreview | null = null;
  // @ts-expect-error - variable is written but used for future UI state tracking
  private isExporting: boolean = false;

  // Import state
  private importFile: File | null = null;
  private isImporting: boolean = false;

  constructor(callbacks: ExportImportModalCallbacks = {}) {
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
   * Set the current game ID for export operations
   */
  setGameId(gameId: string | null): void {
    this.gameId = gameId;
  }

  /**
   * Open the export modal
   */
  async openExport(): Promise<void> {
    this.currentView = 'export';
    this.resetExportState();
    this.render();
    this.show();
  }

  /**
   * Open the import modal
   */
  openImport(): void {
    this.currentView = 'import';
    this.resetImportState();
    this.render();
    this.show();
  }

  /**
   * Close the modal
   */
  close(): void {
    this.hide();
    this.currentView = 'closed';
    this.callbacks.onClose?.();
  }

  // ===========================================================================
  // Private: DOM Creation
  // ===========================================================================

  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'export-import-modal-container';
    container.style.display = 'none';
    return container;
  }

  private createOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'export-import-modal-overlay';
    overlay.addEventListener('click', () => this.close());
    return overlay;
  }

  private createModal(): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'export-import-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'export-import-modal-title');
    modal.addEventListener('click', (e) => e.stopPropagation());
    return modal;
  }

  private injectStyles(): void {
    if (document.getElementById('export-import-modal-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'export-import-modal-styles';
    styles.textContent = `
      .export-import-modal-container {
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

      .export-import-modal-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
      }

      .export-import-modal {
        position: relative;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 1.5rem;
        min-width: 450px;
        max-width: 550px;
        max-height: 80vh;
        overflow-y: auto;
      }

      .export-import-modal h2 {
        font-size: 1.4rem;
        margin-bottom: 1rem;
        color: #e0e0e0;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .export-import-modal .modal-section {
        margin-bottom: 1rem;
      }

      .export-import-modal .section-title {
        font-size: 0.9rem;
        color: #888;
        margin-bottom: 0.5rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .export-import-modal label {
        display: block;
        font-size: 0.9rem;
        color: #888;
        margin-bottom: 0.5rem;
      }

      .export-import-modal input[type="text"],
      .export-import-modal input[type="number"] {
        width: 100%;
        padding: 0.75rem;
        background: #222;
        border: 1px solid #444;
        border-radius: 4px;
        color: #e0e0e0;
        font-size: 1rem;
      }

      .export-import-modal input[type="text"]:focus,
      .export-import-modal input[type="number"]:focus {
        outline: none;
        border-color: #667eea;
      }

      .export-import-modal .checkbox-group {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .export-import-modal .checkbox-item {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
      }

      .export-import-modal .checkbox-item input[type="checkbox"] {
        margin-top: 0.2rem;
        width: 18px;
        height: 18px;
        accent-color: #667eea;
        cursor: pointer;
      }

      .export-import-modal .checkbox-label {
        flex: 1;
      }

      .export-import-modal .checkbox-label .label-text {
        font-size: 0.95rem;
        color: #e0e0e0;
      }

      .export-import-modal .checkbox-label .label-desc {
        font-size: 0.8rem;
        color: #666;
        margin-top: 0.2rem;
      }

      .export-import-modal .button-row {
        display: flex;
        gap: 0.5rem;
        justify-content: flex-end;
        margin-top: 1.5rem;
      }

      .export-import-modal button {
        padding: 0.6rem 1.2rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.9rem;
        transition: opacity 0.2s;
      }

      .export-import-modal button:hover {
        opacity: 0.9;
      }

      .export-import-modal button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .export-import-modal .btn-primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }

      .export-import-modal .btn-secondary {
        background: #333;
        color: #e0e0e0;
      }

      .export-import-modal .btn-success {
        background: #16a34a;
        color: white;
      }

      .export-import-modal .preview-stats {
        background: #222;
        border: 1px solid #333;
        border-radius: 4px;
        padding: 1rem;
      }

      .export-import-modal .stat-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.75rem;
      }

      .export-import-modal .stat-item {
        display: flex;
        flex-direction: column;
      }

      .export-import-modal .stat-value {
        font-size: 1.25rem;
        font-weight: 600;
        color: #e0e0e0;
      }

      .export-import-modal .stat-label {
        font-size: 0.75rem;
        color: #666;
        text-transform: uppercase;
      }

      .export-import-modal .preview-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
        padding-bottom: 0.75rem;
        border-bottom: 1px solid #333;
      }

      .export-import-modal .preview-header .game-info {
        display: flex;
        flex-direction: column;
      }

      .export-import-modal .preview-header .game-id {
        font-size: 0.8rem;
        color: #666;
        font-family: monospace;
      }

      .export-import-modal .preview-header .game-turn {
        font-size: 1.1rem;
        color: #e0e0e0;
      }

      .export-import-modal .file-drop-zone {
        border: 2px dashed #444;
        border-radius: 8px;
        padding: 2rem;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s;
      }

      .export-import-modal .file-drop-zone:hover {
        border-color: #667eea;
        background: rgba(102, 126, 234, 0.05);
      }

      .export-import-modal .file-drop-zone.dragover {
        border-color: #667eea;
        background: rgba(102, 126, 234, 0.1);
      }

      .export-import-modal .file-drop-zone .drop-icon {
        font-size: 2rem;
        margin-bottom: 0.5rem;
      }

      .export-import-modal .file-drop-zone .drop-text {
        color: #e0e0e0;
        margin-bottom: 0.25rem;
      }

      .export-import-modal .file-drop-zone .drop-hint {
        font-size: 0.8rem;
        color: #666;
      }

      .export-import-modal .selected-file {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem;
        background: #222;
        border: 1px solid #333;
        border-radius: 4px;
      }

      .export-import-modal .selected-file .file-info {
        display: flex;
        flex-direction: column;
      }

      .export-import-modal .selected-file .file-name {
        color: #e0e0e0;
      }

      .export-import-modal .selected-file .file-size {
        font-size: 0.8rem;
        color: #666;
      }

      .export-import-modal .error-message {
        color: #f87171;
        font-size: 0.9rem;
        margin-top: 0.5rem;
      }

      .export-import-modal .tabs {
        display: flex;
        gap: 0.25rem;
        margin-bottom: 1.5rem;
        border-bottom: 1px solid #333;
        padding-bottom: 0.75rem;
      }

      .export-import-modal .tab-btn {
        padding: 0.5rem 1rem;
        background: transparent;
        border: none;
        color: #888;
        cursor: pointer;
        font-size: 0.9rem;
        border-radius: 4px 4px 0 0;
        transition: all 0.2s;
      }

      .export-import-modal .tab-btn:hover {
        color: #e0e0e0;
        background: rgba(255, 255, 255, 0.05);
      }

      .export-import-modal .tab-btn.active {
        color: #667eea;
        background: rgba(102, 126, 234, 0.1);
        border-bottom: 2px solid #667eea;
      }

      .export-import-modal .inline-input {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-top: 0.5rem;
      }

      .export-import-modal .inline-input input {
        width: 100px;
      }

      .export-import-modal .inline-input span {
        font-size: 0.85rem;
        color: #888;
      }
    `;
    document.head.appendChild(styles);
  }

  // ===========================================================================
  // Private: Rendering
  // ===========================================================================

  private render(): void {
    switch (this.currentView) {
      case 'export':
        this.renderExportView();
        break;
      case 'export-preview':
        this.renderExportPreviewView();
        break;
      case 'import':
        this.renderImportView();
        break;
      case 'import-confirm':
        this.renderImportConfirmView();
        break;
      default:
        this.modal.innerHTML = '';
    }
  }

  private renderExportView(): void {
    this.modal.innerHTML = `
      <h2 id="export-import-modal-title">Export Game</h2>

      <div class="tabs">
        <button class="tab-btn active" data-tab="export">Export</button>
        <button class="tab-btn" data-tab="import">Import</button>
      </div>

      <div class="modal-section">
        <div class="section-title">Export Options</div>
        <div class="checkbox-group">
          <div class="checkbox-item">
            <input type="checkbox" id="include-events" ${this.exportOptions.includeEvents ? 'checked' : ''} />
            <div class="checkbox-label">
              <div class="label-text">Include Event History</div>
              <div class="label-desc">Full chronicle of all game events</div>
            </div>
          </div>
          <div class="checkbox-item">
            <input type="checkbox" id="include-pending" ${this.exportOptions.includePending ? 'checked' : ''} />
            <div class="checkbox-label">
              <div class="label-text">Include Pending Evolutions</div>
              <div class="label-desc">Unapproved character developments</div>
            </div>
          </div>
          <div class="checkbox-item">
            <input type="checkbox" id="include-notifications" ${this.exportOptions.includeNotifications ? 'checked' : ''} />
            <div class="checkbox-label">
              <div class="label-text">Include Emergence Notifications</div>
              <div class="label-desc">Detected emergent patterns</div>
            </div>
          </div>
          <div class="checkbox-item">
            <input type="checkbox" id="compressed" ${this.exportOptions.compressed ? 'checked' : ''} />
            <div class="checkbox-label">
              <div class="label-text">Compress Output (gzip)</div>
              <div class="label-desc">Smaller file size, .gz extension</div>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-section" id="event-limit-section" style="${this.exportOptions.includeEvents ? '' : 'display: none;'}">
        <label for="event-limit">Event Limit (optional)</label>
        <div class="inline-input">
          <input type="number" id="event-limit" min="1" placeholder="All" value="${this.exportOptions.eventLimit || ''}" />
          <span>Leave empty to include all events</span>
        </div>
      </div>

      <div id="export-error" class="error-message" style="display: none;"></div>

      <div class="button-row">
        <button class="btn-secondary" id="export-cancel-btn">Cancel</button>
        <button class="btn-secondary" id="export-preview-btn" ${!this.gameId ? 'disabled' : ''}>Preview</button>
        <button class="btn-primary" id="export-download-btn" ${!this.gameId ? 'disabled' : ''}>Download</button>
      </div>
    `;

    this.attachExportListeners();
  }

  private attachExportListeners(): void {
    // Tab switching
    const tabs = this.modal.querySelectorAll('.tab-btn');
    tabs.forEach((tab) => {
      tab.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const tabName = target.dataset.tab;
        if (tabName === 'import') {
          this.currentView = 'import';
          this.render();
        }
      });
    });

    // Checkboxes
    const includeEventsCheckbox = this.modal.querySelector('#include-events') as HTMLInputElement;
    const includePendingCheckbox = this.modal.querySelector('#include-pending') as HTMLInputElement;
    const includeNotificationsCheckbox = this.modal.querySelector('#include-notifications') as HTMLInputElement;
    const compressedCheckbox = this.modal.querySelector('#compressed') as HTMLInputElement;
    const eventLimitSection = this.modal.querySelector('#event-limit-section') as HTMLElement;
    const eventLimitInput = this.modal.querySelector('#event-limit') as HTMLInputElement;

    includeEventsCheckbox.addEventListener('change', () => {
      this.exportOptions.includeEvents = includeEventsCheckbox.checked;
      eventLimitSection.style.display = includeEventsCheckbox.checked ? '' : 'none';
    });

    includePendingCheckbox.addEventListener('change', () => {
      this.exportOptions.includePending = includePendingCheckbox.checked;
    });

    includeNotificationsCheckbox.addEventListener('change', () => {
      this.exportOptions.includeNotifications = includeNotificationsCheckbox.checked;
    });

    compressedCheckbox.addEventListener('change', () => {
      this.exportOptions.compressed = compressedCheckbox.checked;
    });

    eventLimitInput.addEventListener('input', () => {
      const value = eventLimitInput.value.trim();
      this.exportOptions.eventLimit = value ? parseInt(value, 10) : null;
    });

    // Buttons
    const cancelBtn = this.modal.querySelector('#export-cancel-btn') as HTMLButtonElement;
    const previewBtn = this.modal.querySelector('#export-preview-btn') as HTMLButtonElement;
    const downloadBtn = this.modal.querySelector('#export-download-btn') as HTMLButtonElement;

    cancelBtn.addEventListener('click', () => this.close());
    previewBtn.addEventListener('click', () => this.handlePreview());
    downloadBtn.addEventListener('click', () => this.handleDownload());
  }

  private renderExportPreviewView(): void {
    if (!this.exportPreview) {
      this.currentView = 'export';
      this.render();
      return;
    }

    const preview = this.exportPreview;
    const createdDate = new Date(preview.createdAt).toLocaleDateString();
    const updatedDate = new Date(preview.updatedAt).toLocaleDateString();

    this.modal.innerHTML = `
      <h2 id="export-import-modal-title">Export Preview</h2>

      <div class="preview-stats">
        <div class="preview-header">
          <div class="game-info">
            <span class="game-id">${this.escapeHtml(preview.gameId)}</span>
            <span class="game-turn">Turn ${preview.turn}</span>
          </div>
          <div class="game-dates" style="text-align: right; font-size: 0.8rem; color: #666;">
            <div>Created: ${createdDate}</div>
            <div>Updated: ${updatedDate}</div>
          </div>
        </div>
        <div class="stat-grid">
          <div class="stat-item">
            <span class="stat-value">${preview.counts.events.toLocaleString()}</span>
            <span class="stat-label">Events</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${preview.counts.scenes}</span>
            <span class="stat-label">Scenes</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${preview.counts.npcs}</span>
            <span class="stat-label">NPCs</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${preview.counts.areas}</span>
            <span class="stat-label">Areas</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${preview.counts.relationships}</span>
            <span class="stat-label">Relationships</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${preview.counts.traits}</span>
            <span class="stat-label">Traits</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${preview.counts.pendingEvolutions}</span>
            <span class="stat-label">Pending Evolutions</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${preview.counts.emergenceNotifications}</span>
            <span class="stat-label">Emergence Alerts</span>
          </div>
        </div>
      </div>

      <div class="modal-section" style="margin-top: 1rem;">
        <div class="section-title">Selected Options</div>
        <div style="font-size: 0.85rem; color: #888;">
          ${this.exportOptions.includeEvents ? `Events: ${this.exportOptions.eventLimit ? `Limited to ${this.exportOptions.eventLimit}` : 'All'}` : 'Events: Excluded'}<br>
          Pending Evolutions: ${this.exportOptions.includePending ? 'Included' : 'Excluded'}<br>
          Emergence Notifications: ${this.exportOptions.includeNotifications ? 'Included' : 'Excluded'}<br>
          Compression: ${this.exportOptions.compressed ? 'Enabled (gzip)' : 'Disabled'}
        </div>
      </div>

      <div id="export-error" class="error-message" style="display: none;"></div>

      <div class="button-row">
        <button class="btn-secondary" id="preview-back-btn">Back</button>
        <button class="btn-primary" id="preview-download-btn">Download</button>
      </div>
    `;

    const backBtn = this.modal.querySelector('#preview-back-btn') as HTMLButtonElement;
    const downloadBtn = this.modal.querySelector('#preview-download-btn') as HTMLButtonElement;

    backBtn.addEventListener('click', () => {
      this.currentView = 'export';
      this.render();
    });

    downloadBtn.addEventListener('click', () => this.handleDownload());
  }

  private renderImportView(): void {
    this.modal.innerHTML = `
      <h2 id="export-import-modal-title">Import Game</h2>

      <div class="tabs">
        <button class="tab-btn" data-tab="export">Export</button>
        <button class="tab-btn active" data-tab="import">Import</button>
      </div>

      <div class="modal-section">
        ${this.importFile ? this.renderSelectedFile() : this.renderFileDropZone()}
      </div>

      <div id="import-error" class="error-message" style="display: none;"></div>

      <div class="button-row">
        <button class="btn-secondary" id="import-cancel-btn">Cancel</button>
        <button class="btn-primary" id="import-continue-btn" ${!this.importFile ? 'disabled' : ''}>
          ${this.isImporting ? 'Importing...' : 'Import'}
        </button>
      </div>
    `;

    this.attachImportListeners();
  }

  private renderFileDropZone(): string {
    return `
      <div class="file-drop-zone" id="file-drop-zone">
        <div class="drop-icon">📁</div>
        <div class="drop-text">Drop a JSON export file here</div>
        <div class="drop-hint">or click to browse</div>
        <input type="file" id="file-input" accept=".json,.gz" style="display: none;" />
      </div>
    `;
  }

  private renderSelectedFile(): string {
    if (!this.importFile) return '';

    const sizeKB = (this.importFile.size / 1024).toFixed(1);
    return `
      <div class="selected-file">
        <div class="file-info">
          <span class="file-name">${this.escapeHtml(this.importFile.name)}</span>
          <span class="file-size">${sizeKB} KB</span>
        </div>
        <button class="btn-secondary" id="remove-file-btn" style="padding: 0.4rem 0.8rem;">Remove</button>
      </div>
    `;
  }

  private attachImportListeners(): void {
    // Tab switching
    const tabs = this.modal.querySelectorAll('.tab-btn');
    tabs.forEach((tab) => {
      tab.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const tabName = target.dataset.tab;
        if (tabName === 'export') {
          this.currentView = 'export';
          this.render();
        }
      });
    });

    // File drop zone
    const dropZone = this.modal.querySelector('#file-drop-zone') as HTMLElement;
    const fileInput = this.modal.querySelector('#file-input') as HTMLInputElement;

    if (dropZone && fileInput) {
      dropZone.addEventListener('click', () => fileInput.click());

      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });

      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
      });

      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer?.files;
        const firstFile = files?.[0];
        if (firstFile) {
          this.handleFileSelect(firstFile);
        }
      });

      fileInput.addEventListener('change', () => {
        const files = fileInput.files;
        const firstFile = files?.[0];
        if (firstFile) {
          this.handleFileSelect(firstFile);
        }
      });
    }

    // Remove file button
    const removeFileBtn = this.modal.querySelector('#remove-file-btn') as HTMLButtonElement;
    if (removeFileBtn) {
      removeFileBtn.addEventListener('click', () => {
        this.importFile = null;
        this.render();
      });
    }

    // Buttons
    const cancelBtn = this.modal.querySelector('#import-cancel-btn') as HTMLButtonElement;
    const continueBtn = this.modal.querySelector('#import-continue-btn') as HTMLButtonElement;

    cancelBtn.addEventListener('click', () => this.close());
    continueBtn.addEventListener('click', () => this.handleImport());
  }

  private renderImportConfirmView(): void {
    this.modal.innerHTML = `
      <h2 id="export-import-modal-title">Confirm Import</h2>

      <div class="modal-section">
        <p style="color: #e0e0e0; margin-bottom: 1rem;">
          Are you sure you want to import this game?
        </p>
        <p style="color: #888; font-size: 0.9rem;">
          This will create a new game session from the exported data.
        </p>
      </div>

      ${this.importFile ? `
        <div class="selected-file" style="margin-bottom: 1rem;">
          <div class="file-info">
            <span class="file-name">${this.escapeHtml(this.importFile.name)}</span>
            <span class="file-size">${(this.importFile.size / 1024).toFixed(1)} KB</span>
          </div>
        </div>
      ` : ''}

      <div id="import-error" class="error-message" style="display: none;"></div>

      <div class="button-row">
        <button class="btn-secondary" id="confirm-back-btn">Back</button>
        <button class="btn-success" id="confirm-import-btn" ${this.isImporting ? 'disabled' : ''}>
          ${this.isImporting ? 'Importing...' : 'Confirm Import'}
        </button>
      </div>
    `;

    const backBtn = this.modal.querySelector('#confirm-back-btn') as HTMLButtonElement;
    const confirmBtn = this.modal.querySelector('#confirm-import-btn') as HTMLButtonElement;

    backBtn.addEventListener('click', () => {
      this.currentView = 'import';
      this.render();
    });

    confirmBtn.addEventListener('click', () => this.executeImport());
  }

  // ===========================================================================
  // Private: Handlers
  // ===========================================================================

  private async handlePreview(): Promise<void> {
    if (!this.gameId) return;

    const errorEl = this.modal.querySelector('#export-error') as HTMLElement;
    const previewBtn = this.modal.querySelector('#export-preview-btn') as HTMLButtonElement;

    previewBtn.disabled = true;
    previewBtn.textContent = 'Loading...';

    try {
      const response = await fetch(`/api/export/${this.gameId}/json/preview`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load preview');
      }

      this.exportPreview = await response.json();
      this.currentView = 'export-preview';
      this.render();
    } catch (error) {
      errorEl.textContent = error instanceof Error ? error.message : 'Failed to load preview';
      errorEl.style.display = 'block';
      previewBtn.disabled = false;
      previewBtn.textContent = 'Preview';
    }
  }

  private async handleDownload(): Promise<void> {
    if (!this.gameId) return;

    const errorEl = this.modal.querySelector('#export-error') as HTMLElement;
    const downloadBtn = this.modal.querySelector('#export-download-btn, #preview-download-btn') as HTMLButtonElement;

    if (!downloadBtn) return;

    this.isExporting = true;
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Downloading...';

    try {
      // Build query params
      const params = new URLSearchParams();
      params.set('includeEvents', String(this.exportOptions.includeEvents));
      if (this.exportOptions.eventLimit) {
        params.set('eventLimit', String(this.exportOptions.eventLimit));
      }
      params.set('includePending', String(this.exportOptions.includePending));
      params.set('includeNotifications', String(this.exportOptions.includeNotifications));
      params.set('compressed', String(this.exportOptions.compressed));

      const response = await fetch(`/api/export/${this.gameId}/json?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Export failed');
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `game-export-${this.gameId}.json`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+?)"/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      // Download the file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Call callback and close
      await this.callbacks.onExport?.(this.exportOptions);
      this.close();
    } catch (error) {
      errorEl.textContent = error instanceof Error ? error.message : 'Export failed';
      errorEl.style.display = 'block';
      this.isExporting = false;
      downloadBtn.disabled = false;
      downloadBtn.textContent = 'Download';
    }
  }

  private handleFileSelect(file: File): void {
    // Validate file type
    if (!file.name.endsWith('.json') && !file.name.endsWith('.gz')) {
      const errorEl = this.modal.querySelector('#import-error') as HTMLElement;
      if (errorEl) {
        errorEl.textContent = 'Please select a .json or .gz file';
        errorEl.style.display = 'block';
      }
      return;
    }

    this.importFile = file;
    this.render();
  }

  private handleImport(): void {
    if (!this.importFile) return;

    // Go to confirmation view
    this.currentView = 'import-confirm';
    this.render();
  }

  private async executeImport(): Promise<void> {
    if (!this.importFile) return;

    const errorEl = this.modal.querySelector('#import-error') as HTMLElement;
    const confirmBtn = this.modal.querySelector('#confirm-import-btn') as HTMLButtonElement;

    this.isImporting = true;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Importing...';

    try {
      await this.callbacks.onImport?.(this.importFile);
      this.close();
    } catch (error) {
      errorEl.textContent = error instanceof Error ? error.message : 'Import failed';
      errorEl.style.display = 'block';
      this.isImporting = false;
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm Import';
    }
  }

  // ===========================================================================
  // Private: Utilities
  // ===========================================================================

  private resetExportState(): void {
    this.exportOptions = {
      includeEvents: true,
      eventLimit: null,
      includePending: true,
      includeNotifications: true,
      compressed: false,
    };
    this.exportPreview = null;
    this.isExporting = false;
  }

  private resetImportState(): void {
    this.importFile = null;
    this.isImporting = false;
  }

  private show(): void {
    this.previouslyFocusedElement = document.activeElement as HTMLElement;
    this.container.style.display = 'flex';
    document.addEventListener('keydown', this.boundKeydownHandler);

    requestAnimationFrame(() => {
      this.focusFirstElement();
    });
  }

  private hide(): void {
    this.container.style.display = 'none';
    document.removeEventListener('keydown', this.boundKeydownHandler);

    if (this.previouslyFocusedElement && this.previouslyFocusedElement.focus) {
      this.previouslyFocusedElement.focus();
    }
    this.previouslyFocusedElement = null;
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }

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
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
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
 * Create and mount an export/import modal instance
 */
export function createExportImportModal(callbacks: ExportImportModalCallbacks = {}): ExportImportModal {
  const modal = new ExportImportModal(callbacks);
  modal.mount();
  return modal;
}
