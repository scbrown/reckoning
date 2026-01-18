/**
 * Evolution Approval Panel Component
 *
 * UI for DM to review and manage pending entity evolutions.
 * Shows evolution type, entity, suggested change, reason, and source event.
 * Actions: Approve, Edit, Refuse.
 */

/**
 * Evolution types that can be suggested
 */
export type EvolutionType = 'trait_add' | 'trait_remove' | 'relationship_change';

/**
 * Resolution status for pending evolutions
 */
export type EvolutionStatus = 'pending' | 'approved' | 'edited' | 'refused';

/**
 * Entity types that can evolve
 */
export type EntityType = 'player' | 'npc' | 'location' | 'item';

/**
 * Relationship dimensions that can change
 */
export type RelationshipDimension = 'trust' | 'respect' | 'affection' | 'fear' | 'resentment' | 'debt';

/**
 * Pending evolution data structure
 */
export interface PendingEvolution {
  id: string;
  gameId: string;
  turn: number;
  evolutionType: EvolutionType;
  entityType: EntityType;
  entityId: string;
  trait?: string;
  targetType?: EntityType;
  targetId?: string;
  dimension?: RelationshipDimension;
  oldValue?: number;
  newValue?: number;
  reason: string;
  sourceEventId?: string;
  status: EvolutionStatus;
  dmNotes?: string;
  createdAt: string;
  resolvedAt?: string;
}

/**
 * Configuration for EvolutionApprovalPanel
 */
export interface EvolutionApprovalPanelConfig {
  containerId: string;
}

/**
 * Callbacks for evolution actions
 */
export interface EvolutionApprovalCallbacks {
  onApprove: (evolutionId: string, dmNotes?: string) => void;
  onEdit: (evolutionId: string, changes: Partial<PendingEvolution>, dmNotes?: string) => void;
  onRefuse: (evolutionId: string, dmNotes?: string) => void;
}

/**
 * Evolution Approval Panel component for DM review
 */
export class EvolutionApprovalPanel {
  private container: HTMLElement;
  private callbacks: EvolutionApprovalCallbacks;
  private pendingEvolutions: PendingEvolution[] = [];
  private selectedId: string | null = null;
  private isEditing: boolean = false;
  private editValues: Partial<PendingEvolution> = {};

  constructor(config: EvolutionApprovalPanelConfig, callbacks: EvolutionApprovalCallbacks) {
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
   * Update the list of pending evolutions
   */
  setPendingEvolutions(evolutions: PendingEvolution[]): void {
    this.pendingEvolutions = evolutions.filter(e => e.status === 'pending');
    // Clear selection if selected evolution is no longer pending
    if (this.selectedId && !this.pendingEvolutions.find(e => e.id === this.selectedId)) {
      this.selectedId = null;
      this.isEditing = false;
      this.editValues = {};
    }
    this.updateDOM();
  }

  /**
   * Select an evolution by ID
   */
  selectEvolution(id: string | null): void {
    this.selectedId = id;
    this.isEditing = false;
    this.editValues = {};
    this.updateDOM();
  }

  /**
   * Check if there are pending evolutions
   */
  hasPending(): boolean {
    return this.pendingEvolutions.length > 0;
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
    const count = this.pendingEvolutions.length;
    const selected = this.selectedId
      ? this.pendingEvolutions.find(e => e.id === this.selectedId)
      : null;

    this.container.innerHTML = `
      <div class="evolution-approval-panel">
        <div class="evolution-header">
          <h3>Entity Evolutions</h3>
          ${count > 0 ? `<span class="evolution-badge">${count}</span>` : ''}
        </div>
        ${count === 0 ? this.renderEmptyState() : this.renderContent(selected)}
      </div>
    `;

    this.attachEventListeners();
  }

  private renderEmptyState(): string {
    return `
      <div class="evolution-empty">
        <span class="evolution-empty-text">No pending evolutions</span>
      </div>
    `;
  }

  private renderContent(selected: PendingEvolution | null | undefined): string {
    return `
      <div class="evolution-list" role="listbox" aria-label="Pending evolutions">
        ${this.pendingEvolutions.map(evolution => this.renderListItem(evolution)).join('')}
      </div>
      ${selected ? this.renderDetails(selected) : ''}
    `;
  }

  private renderListItem(evolution: PendingEvolution): string {
    const isSelected = evolution.id === this.selectedId;
    const typeLabel = this.getEvolutionTypeLabel(evolution.evolutionType);
    const entityLabel = this.formatEntityLabel(evolution.entityType, evolution.entityId);
    const changePreview = this.getChangePreview(evolution);

    return `
      <div
        class="evolution-item ${isSelected ? 'selected' : ''}"
        role="option"
        aria-selected="${isSelected}"
        data-evolution-id="${evolution.id}"
        tabindex="${isSelected ? '0' : '-1'}"
      >
        <div class="evolution-item-header">
          <span class="evolution-type-badge evolution-type-${evolution.evolutionType}">${typeLabel}</span>
          <span class="evolution-turn">Turn ${evolution.turn}</span>
        </div>
        <div class="evolution-item-entity">${entityLabel}</div>
        <div class="evolution-item-change">${changePreview}</div>
      </div>
    `;
  }

  private renderDetails(evolution: PendingEvolution): string {
    if (this.isEditing) {
      return this.renderEditForm(evolution);
    }

    const entityLabel = this.formatEntityLabel(evolution.entityType, evolution.entityId);
    const typeLabel = this.getEvolutionTypeLabel(evolution.evolutionType);

    return `
      <div class="evolution-details">
        <div class="evolution-detail-row">
          <span class="detail-label">Entity:</span>
          <span class="detail-value">${entityLabel}</span>
        </div>
        <div class="evolution-detail-row">
          <span class="detail-label">Type:</span>
          <span class="detail-value evolution-type-${evolution.evolutionType}">${typeLabel}</span>
        </div>
        ${this.renderChangeDetails(evolution)}
        <div class="evolution-detail-row evolution-reason">
          <span class="detail-label">Reason:</span>
          <span class="detail-value">${this.escapeHtml(evolution.reason)}</span>
        </div>
        ${evolution.sourceEventId ? `
          <div class="evolution-detail-row">
            <span class="detail-label">Source:</span>
            <span class="detail-value evolution-source">Event #${evolution.sourceEventId.slice(0, 8)}</span>
          </div>
        ` : ''}
        <div class="evolution-notes">
          <label for="dm-notes">DM Notes (optional):</label>
          <input
            type="text"
            id="dm-notes"
            class="dm-notes-input"
            placeholder="Add notes..."
            aria-label="DM notes for evolution"
          />
        </div>
        <div class="evolution-actions" role="toolbar" aria-label="Evolution actions">
          <button class="btn btn-approve" data-action="approve" title="Approve this evolution">
            Approve
          </button>
          <button class="btn btn-edit" data-action="edit" title="Edit before approving">
            Edit
          </button>
          <button class="btn btn-refuse" data-action="refuse" title="Refuse this evolution">
            Refuse
          </button>
        </div>
      </div>
    `;
  }

  private renderEditForm(evolution: PendingEvolution): string {
    const entityLabel = this.formatEntityLabel(evolution.entityType, evolution.entityId);

    return `
      <div class="evolution-details evolution-edit-mode">
        <div class="evolution-detail-row">
          <span class="detail-label">Entity:</span>
          <span class="detail-value">${entityLabel}</span>
        </div>
        ${this.renderEditableChange(evolution)}
        <div class="evolution-detail-row evolution-reason">
          <label class="detail-label" for="edit-reason">Reason:</label>
          <textarea
            id="edit-reason"
            class="edit-input edit-reason"
            rows="2"
          >${this.escapeHtml(this.editValues.reason ?? evolution.reason)}</textarea>
        </div>
        <div class="evolution-notes">
          <label for="dm-notes">DM Notes (optional):</label>
          <input
            type="text"
            id="dm-notes"
            class="dm-notes-input"
            placeholder="Add notes..."
            aria-label="DM notes for evolution"
          />
        </div>
        <div class="evolution-actions" role="toolbar" aria-label="Edit actions">
          <button class="btn btn-approve" data-action="save-edit" title="Save and approve">
            Save & Approve
          </button>
          <button class="btn btn-cancel" data-action="cancel-edit" title="Cancel editing">
            Cancel
          </button>
        </div>
      </div>
    `;
  }

  private renderChangeDetails(evolution: PendingEvolution): string {
    switch (evolution.evolutionType) {
      case 'trait_add':
        return `
          <div class="evolution-detail-row">
            <span class="detail-label">Add Trait:</span>
            <span class="detail-value trait-badge trait-add">+ ${this.escapeHtml(evolution.trait || '')}</span>
          </div>
        `;
      case 'trait_remove':
        return `
          <div class="evolution-detail-row">
            <span class="detail-label">Remove Trait:</span>
            <span class="detail-value trait-badge trait-remove">- ${this.escapeHtml(evolution.trait || '')}</span>
          </div>
        `;
      case 'relationship_change': {
        const targetLabel = evolution.targetType && evolution.targetId
          ? this.formatEntityLabel(evolution.targetType, evolution.targetId)
          : 'Unknown';
        const dimension = evolution.dimension || 'unknown';
        const oldVal = evolution.oldValue !== undefined ? (evolution.oldValue * 100).toFixed(0) : '?';
        const newVal = evolution.newValue !== undefined ? (evolution.newValue * 100).toFixed(0) : '?';
        const delta = evolution.oldValue !== undefined && evolution.newValue !== undefined
          ? evolution.newValue - evolution.oldValue
          : 0;
        const deltaClass = delta > 0 ? 'positive' : delta < 0 ? 'negative' : '';

        return `
          <div class="evolution-detail-row">
            <span class="detail-label">Target:</span>
            <span class="detail-value">${targetLabel}</span>
          </div>
          <div class="evolution-detail-row">
            <span class="detail-label">Dimension:</span>
            <span class="detail-value dimension-badge dimension-${dimension}">${this.formatDimension(dimension)}</span>
          </div>
          <div class="evolution-detail-row">
            <span class="detail-label">Change:</span>
            <span class="detail-value relationship-change ${deltaClass}">
              ${oldVal}% → ${newVal}%
              <span class="delta">(${delta > 0 ? '+' : ''}${(delta * 100).toFixed(0)}%)</span>
            </span>
          </div>
        `;
      }
      default:
        return '';
    }
  }

  private renderEditableChange(evolution: PendingEvolution): string {
    switch (evolution.evolutionType) {
      case 'trait_add':
      case 'trait_remove': {
        const trait = this.editValues.trait ?? evolution.trait ?? '';
        return `
          <div class="evolution-detail-row">
            <label class="detail-label" for="edit-trait">${evolution.evolutionType === 'trait_add' ? 'Add' : 'Remove'} Trait:</label>
            <input
              type="text"
              id="edit-trait"
              class="edit-input"
              value="${this.escapeHtml(trait)}"
            />
          </div>
        `;
      }
      case 'relationship_change': {
        const targetLabel = evolution.targetType && evolution.targetId
          ? this.formatEntityLabel(evolution.targetType, evolution.targetId)
          : 'Unknown';
        const newValue = this.editValues.newValue ?? evolution.newValue ?? 0.5;

        return `
          <div class="evolution-detail-row">
            <span class="detail-label">Target:</span>
            <span class="detail-value">${targetLabel}</span>
          </div>
          <div class="evolution-detail-row">
            <span class="detail-label">Dimension:</span>
            <span class="detail-value">${this.formatDimension(evolution.dimension || 'unknown')}</span>
          </div>
          <div class="evolution-detail-row">
            <label class="detail-label" for="edit-value">New Value:</label>
            <div class="edit-slider-container">
              <input
                type="range"
                id="edit-value"
                class="edit-slider"
                min="0"
                max="100"
                value="${(newValue * 100).toFixed(0)}"
              />
              <span class="edit-slider-value">${(newValue * 100).toFixed(0)}%</span>
            </div>
          </div>
        `;
      }
      default:
        return '';
    }
  }

  private attachEventListeners(): void {
    // List item selection
    const items = this.container.querySelectorAll('.evolution-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-evolution-id');
        if (id) {
          this.selectEvolution(id);
        }
      });
      item.addEventListener('keydown', (e) => {
        const event = e as KeyboardEvent;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          const id = item.getAttribute('data-evolution-id');
          if (id) {
            this.selectEvolution(id);
          }
        }
      });
    });

    // Action buttons
    const approveBtn = this.container.querySelector('[data-action="approve"]');
    const editBtn = this.container.querySelector('[data-action="edit"]');
    const refuseBtn = this.container.querySelector('[data-action="refuse"]');
    const saveEditBtn = this.container.querySelector('[data-action="save-edit"]');
    const cancelEditBtn = this.container.querySelector('[data-action="cancel-edit"]');

    approveBtn?.addEventListener('click', () => this.handleApprove());
    editBtn?.addEventListener('click', () => this.handleStartEdit());
    refuseBtn?.addEventListener('click', () => this.handleRefuse());
    saveEditBtn?.addEventListener('click', () => this.handleSaveEdit());
    cancelEditBtn?.addEventListener('click', () => this.handleCancelEdit());

    // Edit form inputs
    if (this.isEditing) {
      const traitInput = this.container.querySelector('#edit-trait') as HTMLInputElement;
      const valueSlider = this.container.querySelector('#edit-value') as HTMLInputElement;
      const reasonInput = this.container.querySelector('#edit-reason') as HTMLTextAreaElement;

      traitInput?.addEventListener('input', () => {
        this.editValues.trait = traitInput.value;
      });

      valueSlider?.addEventListener('input', () => {
        this.editValues.newValue = parseInt(valueSlider.value, 10) / 100;
        const valueDisplay = this.container.querySelector('.edit-slider-value');
        if (valueDisplay) {
          valueDisplay.textContent = `${valueSlider.value}%`;
        }
      });

      reasonInput?.addEventListener('input', () => {
        this.editValues.reason = reasonInput.value;
      });
    }
  }

  private handleApprove(): void {
    if (!this.selectedId) return;

    const notesInput = this.container.querySelector('.dm-notes-input') as HTMLInputElement;
    const dmNotes = notesInput?.value.trim() || undefined;

    this.callbacks.onApprove(this.selectedId, dmNotes);
  }

  private handleStartEdit(): void {
    if (!this.selectedId) return;

    const selected = this.pendingEvolutions.find(e => e.id === this.selectedId);
    if (!selected) return;

    this.isEditing = true;
    // Only set properties that are defined to avoid undefined assignment issues
    this.editValues = {};
    if (selected.trait !== undefined) this.editValues.trait = selected.trait;
    if (selected.newValue !== undefined) this.editValues.newValue = selected.newValue;
    if (selected.reason !== undefined) this.editValues.reason = selected.reason;
    this.updateDOM();
  }

  private handleSaveEdit(): void {
    if (!this.selectedId) return;

    const notesInput = this.container.querySelector('.dm-notes-input') as HTMLInputElement;
    const dmNotes = notesInput?.value.trim() || undefined;

    this.callbacks.onEdit(this.selectedId, this.editValues, dmNotes);
    this.isEditing = false;
    this.editValues = {};
  }

  private handleCancelEdit(): void {
    this.isEditing = false;
    this.editValues = {};
    this.updateDOM();
  }

  private handleRefuse(): void {
    if (!this.selectedId) return;

    const notesInput = this.container.querySelector('.dm-notes-input') as HTMLInputElement;
    const dmNotes = notesInput?.value.trim() || undefined;

    this.callbacks.onRefuse(this.selectedId, dmNotes);
  }

  private getEvolutionTypeLabel(type: EvolutionType): string {
    switch (type) {
      case 'trait_add':
        return 'Add Trait';
      case 'trait_remove':
        return 'Remove Trait';
      case 'relationship_change':
        return 'Relationship';
      default:
        return 'Unknown';
    }
  }

  private formatEntityLabel(type: EntityType, id: string): string {
    const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
    // Truncate long IDs for display
    const shortId = id.length > 12 ? id.slice(0, 12) + '...' : id;
    return `${typeLabel}: ${shortId}`;
  }

  private formatDimension(dimension: string): string {
    return dimension.charAt(0).toUpperCase() + dimension.slice(1);
  }

  private getChangePreview(evolution: PendingEvolution): string {
    switch (evolution.evolutionType) {
      case 'trait_add':
        return `+ ${evolution.trait || 'trait'}`;
      case 'trait_remove':
        return `- ${evolution.trait || 'trait'}`;
      case 'relationship_change': {
        const delta = evolution.oldValue !== undefined && evolution.newValue !== undefined
          ? evolution.newValue - evolution.oldValue
          : 0;
        const sign = delta > 0 ? '+' : '';
        return `${evolution.dimension || '?'} ${sign}${(delta * 100).toFixed(0)}%`;
      }
      default:
        return '';
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private injectStyles(): void {
    if (document.getElementById('evolution-approval-panel-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'evolution-approval-panel-styles';
    styles.textContent = `
      .evolution-approval-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #111;
        border: 1px solid #333;
        border-radius: 6px;
        overflow: hidden;
      }

      .evolution-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1rem;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-bottom: 1px solid #333;
      }

      .evolution-header h3 {
        margin: 0;
        font-size: 0.95rem;
        color: white;
        font-weight: 600;
      }

      .evolution-badge {
        background: rgba(255, 255, 255, 0.2);
        color: white;
        padding: 0.15rem 0.5rem;
        border-radius: 10px;
        font-size: 0.8rem;
        font-weight: 600;
      }

      .evolution-empty {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
      }

      .evolution-empty-text {
        color: #666;
        font-style: italic;
        font-size: 0.9rem;
      }

      .evolution-list {
        flex: 0 0 auto;
        max-height: 180px;
        overflow-y: auto;
        border-bottom: 1px solid #333;
      }

      .evolution-item {
        padding: 0.75rem 1rem;
        border-bottom: 1px solid #2a2a2a;
        cursor: pointer;
        transition: background 0.2s;
      }

      .evolution-item:last-child {
        border-bottom: none;
      }

      .evolution-item:hover {
        background: #1a1a1a;
      }

      .evolution-item.selected {
        background: #222;
        border-left: 3px solid #667eea;
        padding-left: calc(1rem - 3px);
      }

      .evolution-item:focus {
        outline: 2px solid #667eea;
        outline-offset: -2px;
      }

      .evolution-item-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.35rem;
      }

      .evolution-type-badge {
        font-size: 0.7rem;
        padding: 0.15rem 0.4rem;
        border-radius: 3px;
        font-weight: 500;
        text-transform: uppercase;
      }

      .evolution-type-trait_add {
        background: rgba(22, 163, 74, 0.2);
        color: #4ade80;
      }

      .evolution-type-trait_remove {
        background: rgba(220, 38, 38, 0.2);
        color: #f87171;
      }

      .evolution-type-relationship_change {
        background: rgba(102, 126, 234, 0.2);
        color: #667eea;
      }

      .evolution-turn {
        font-size: 0.75rem;
        color: #666;
      }

      .evolution-item-entity {
        font-size: 0.85rem;
        color: #e0e0e0;
        margin-bottom: 0.25rem;
      }

      .evolution-item-change {
        font-size: 0.8rem;
        color: #888;
      }

      .evolution-details {
        flex: 1;
        padding: 0.75rem 1rem;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .evolution-detail-row {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
      }

      .detail-label {
        flex: 0 0 70px;
        font-size: 0.8rem;
        color: #888;
        font-weight: 500;
      }

      .detail-value {
        flex: 1;
        font-size: 0.85rem;
        color: #e0e0e0;
      }

      .evolution-reason {
        flex-direction: column;
        gap: 0.25rem;
      }

      .evolution-reason .detail-value {
        padding: 0.5rem;
        background: #1a1a1a;
        border-radius: 4px;
        font-style: italic;
        line-height: 1.4;
      }

      .evolution-source {
        font-family: monospace;
        font-size: 0.8rem;
        color: #667eea;
      }

      .trait-badge {
        padding: 0.2rem 0.5rem;
        border-radius: 3px;
        font-weight: 500;
      }

      .trait-add {
        background: rgba(22, 163, 74, 0.2);
        color: #4ade80;
      }

      .trait-remove {
        background: rgba(220, 38, 38, 0.2);
        color: #f87171;
      }

      .dimension-badge {
        padding: 0.15rem 0.4rem;
        border-radius: 3px;
        font-weight: 500;
      }

      .dimension-trust { background: rgba(22, 163, 74, 0.2); color: #4ade80; }
      .dimension-respect { background: rgba(102, 126, 234, 0.2); color: #667eea; }
      .dimension-affection { background: rgba(236, 72, 153, 0.2); color: #ec4899; }
      .dimension-fear { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
      .dimension-resentment { background: rgba(220, 38, 38, 0.2); color: #f87171; }
      .dimension-debt { background: rgba(139, 92, 246, 0.2); color: #a78bfa; }

      .relationship-change {
        font-family: monospace;
      }

      .relationship-change.positive {
        color: #4ade80;
      }

      .relationship-change.negative {
        color: #f87171;
      }

      .relationship-change .delta {
        font-size: 0.75rem;
        opacity: 0.8;
        margin-left: 0.25rem;
      }

      .evolution-notes {
        margin-top: 0.5rem;
        padding-top: 0.5rem;
        border-top: 1px solid #2a2a2a;
      }

      .evolution-notes label {
        display: block;
        font-size: 0.8rem;
        color: #888;
        margin-bottom: 0.35rem;
      }

      .dm-notes-input {
        width: 100%;
        padding: 0.5rem;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 4px;
        color: #e0e0e0;
        font-size: 0.85rem;
      }

      .dm-notes-input:focus {
        outline: none;
        border-color: #667eea;
      }

      .evolution-actions {
        display: flex;
        gap: 0.5rem;
        margin-top: auto;
        padding-top: 0.5rem;
      }

      .evolution-actions .btn {
        flex: 1;
        padding: 0.6rem 0.75rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 500;
        transition: all 0.2s;
      }

      .evolution-actions .btn:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
      }

      .evolution-actions .btn:active:not(:disabled) {
        transform: translateY(0);
      }

      .evolution-actions .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .evolution-actions .btn:focus {
        outline: 2px solid #667eea;
        outline-offset: 2px;
      }

      .evolution-actions .btn-approve {
        background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%);
        color: white;
      }

      .evolution-actions .btn-edit {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }

      .evolution-actions .btn-refuse {
        background: linear-gradient(135deg, #dc2626 0%, #f87171 100%);
        color: white;
      }

      .evolution-actions .btn-cancel {
        background: #333;
        color: #888;
      }

      /* Edit mode styles */
      .evolution-edit-mode .edit-input {
        width: 100%;
        padding: 0.5rem;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 4px;
        color: #e0e0e0;
        font-size: 0.85rem;
      }

      .evolution-edit-mode .edit-input:focus {
        outline: none;
        border-color: #667eea;
      }

      .evolution-edit-mode .edit-reason {
        resize: vertical;
        min-height: 50px;
        font-family: inherit;
      }

      .edit-slider-container {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex: 1;
      }

      .edit-slider {
        flex: 1;
        height: 6px;
        -webkit-appearance: none;
        background: #333;
        border-radius: 3px;
        outline: none;
      }

      .edit-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 16px;
        height: 16px;
        background: #667eea;
        border-radius: 50%;
        cursor: pointer;
      }

      .edit-slider::-moz-range-thumb {
        width: 16px;
        height: 16px;
        background: #667eea;
        border-radius: 50%;
        cursor: pointer;
        border: none;
      }

      .edit-slider-value {
        min-width: 40px;
        text-align: right;
        font-size: 0.85rem;
        color: #e0e0e0;
        font-family: monospace;
      }
    `;
    document.head.appendChild(styles);
  }
}
