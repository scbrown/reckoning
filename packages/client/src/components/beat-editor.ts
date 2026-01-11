/**
 * Beat Editor Component
 *
 * Editor for viewing and editing narrative beat sequences.
 * Features: collapsible list, drag-drop reordering, color coding, inline edit.
 */

import type { GameStateManager } from '../state/game-state.js';
import type { ClientGameState } from '../state/types.js';
import type { NarrativeBeat, BeatType, BeatSequence } from '@reckoning/shared';

export interface BeatEditorConfig {
  containerId: string;
}

/**
 * Color scheme for beat types
 */
const BEAT_COLORS: Record<BeatType, { bg: string; border: string; icon: string }> = {
  narration: { bg: '#1a1a2e', border: '#4a4a6a', icon: '📖' },
  dialogue: { bg: '#1a2e1a', border: '#4a6a4a', icon: '💬' },
  action: { bg: '#2e1a1a', border: '#6a4a4a', icon: '⚔️' },
  thought: { bg: '#2e2e1a', border: '#6a6a4a', icon: '💭' },
  sound: { bg: '#1a2e2e', border: '#4a6a6a', icon: '🔊' },
  transition: { bg: '#2e1a2e', border: '#6a4a6a', icon: '🔄' },
};

/**
 * Beat Editor component for editing narrative beat sequences
 */
export class BeatEditor {
  private container: HTMLElement;
  private state: GameStateManager;
  private unsubscribe: (() => void) | null = null;
  private beats: NarrativeBeat[] = [];
  private collapsedBeats: Set<string> = new Set();
  private draggedBeatId: string | null = null;
  private editingBeatId: string | null = null;

  constructor(config: BeatEditorConfig, state: GameStateManager) {
    const container = document.getElementById(config.containerId);
    if (!container) {
      throw new Error(`Container element #${config.containerId} not found`);
    }
    this.container = container;
    this.state = state;
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
      <div class="beat-editor">
        <div class="beat-editor-header">
          <span class="beat-editor-title">Beat Sequence</span>
          <div class="beat-editor-actions">
            <button class="beat-action-btn expand-all" title="Expand All">▼</button>
            <button class="beat-action-btn collapse-all" title="Collapse All">▲</button>
            <span class="beat-count">0 beats</span>
          </div>
        </div>
        <div class="beat-editor-content">
          <div class="beat-list"></div>
          <div class="beat-editor-empty">
            <span>No beats to display</span>
            <span class="beat-editor-hint">AI will generate beats here...</span>
          </div>
        </div>
        <div class="beat-editor-footer">
          <button class="beat-add-btn" title="Add Beat">+ Add Beat</button>
        </div>
      </div>
    `;

    this.setupEventListeners();

    // Subscribe to state changes
    this.unsubscribe = this.state.subscribe((state) => this.update(state));

    // Initial update
    this.update(this.state.getState());
  }

  /**
   * Update from state
   */
  update(state: ClientGameState): void {
    // Extract beats from pending content or editor state
    // For now, we'll create mock beats from the pending content
    const pendingContent = state.editorState?.pending || state.pendingContent?.content;

    if (pendingContent) {
      // Parse the pending content into beats (temporary until server provides beats)
      this.beats = this.parseContentToBeats(pendingContent);
    } else {
      this.beats = [];
    }

    this.renderBeats();
    this.updateBeatCount();
  }

  /**
   * Get all beats
   */
  getBeats(): NarrativeBeat[] {
    return [...this.beats];
  }

  /**
   * Get combined content from all beats
   */
  getContent(): string {
    return this.beats.map((b) => b.content).join('\n\n');
  }

  /**
   * Set beats directly
   */
  setBeats(beats: NarrativeBeat[]): void {
    this.beats = [...beats];
    this.renderBeats();
    this.updateBeatCount();
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.container.innerHTML = '';
  }

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  private setupEventListeners(): void {
    // Expand/Collapse all buttons
    const expandAllBtn = this.container.querySelector('.expand-all');
    const collapseAllBtn = this.container.querySelector('.collapse-all');
    const addBeatBtn = this.container.querySelector('.beat-add-btn');

    expandAllBtn?.addEventListener('click', () => this.expandAll());
    collapseAllBtn?.addEventListener('click', () => this.collapseAll());
    addBeatBtn?.addEventListener('click', () => this.addNewBeat());
  }

  private handleBeatClick(beatId: string): void {
    if (this.collapsedBeats.has(beatId)) {
      this.collapsedBeats.delete(beatId);
    } else {
      this.collapsedBeats.add(beatId);
    }
    this.renderBeats();
  }

  private handleDragStart(e: DragEvent, beatId: string): void {
    this.draggedBeatId = beatId;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', beatId);
    }
    const el = e.target as HTMLElement;
    el.classList.add('dragging');
  }

  private handleDragEnd(e: DragEvent): void {
    this.draggedBeatId = null;
    const el = e.target as HTMLElement;
    el.classList.remove('dragging');
    // Remove all drag-over states
    this.container.querySelectorAll('.drag-over').forEach((el) => {
      el.classList.remove('drag-over');
    });
  }

  private handleDragOver(e: DragEvent, beatId: string): void {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    const el = e.currentTarget as HTMLElement;
    if (this.draggedBeatId && this.draggedBeatId !== beatId) {
      el.classList.add('drag-over');
    }
  }

  private handleDragLeave(e: DragEvent): void {
    const el = e.currentTarget as HTMLElement;
    el.classList.remove('drag-over');
  }

  private handleDrop(e: DragEvent, targetBeatId: string): void {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.classList.remove('drag-over');

    if (!this.draggedBeatId || this.draggedBeatId === targetBeatId) return;

    // Reorder beats
    const draggedIndex = this.beats.findIndex((b) => b.id === this.draggedBeatId);
    const targetIndex = this.beats.findIndex((b) => b.id === targetBeatId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const [draggedBeat] = this.beats.splice(draggedIndex, 1);
      this.beats.splice(targetIndex, 0, draggedBeat);
      this.renderBeats();
    }

    this.draggedBeatId = null;
  }

  private handleEditStart(beatId: string): void {
    this.editingBeatId = beatId;
    this.renderBeats();

    // Focus the textarea
    setTimeout(() => {
      const textarea = this.container.querySelector(
        `.beat-item[data-beat-id="${beatId}"] .beat-content-edit`
      ) as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
    }, 0);
  }

  private handleEditSave(beatId: string, newContent: string): void {
    const beat = this.beats.find((b) => b.id === beatId);
    if (beat) {
      beat.content = newContent;
    }
    this.editingBeatId = null;
    this.renderBeats();
  }

  private handleEditCancel(): void {
    this.editingBeatId = null;
    this.renderBeats();
  }

  private handleTypeChange(beatId: string, newType: BeatType): void {
    const beat = this.beats.find((b) => b.id === beatId);
    if (beat) {
      beat.type = newType;
      this.renderBeats();
    }
  }

  private handleDeleteBeat(beatId: string): void {
    this.beats = this.beats.filter((b) => b.id !== beatId);
    this.collapsedBeats.delete(beatId);
    this.renderBeats();
    this.updateBeatCount();
  }

  // ===========================================================================
  // Rendering
  // ===========================================================================

  private renderBeats(): void {
    const listEl = this.container.querySelector('.beat-list');
    const emptyEl = this.container.querySelector('.beat-editor-empty') as HTMLElement;

    if (!listEl) return;

    if (this.beats.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'flex';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    listEl.innerHTML = this.beats
      .map((beat, index) => this.renderBeatItem(beat, index))
      .join('');

    // Attach event listeners to beat items
    this.beats.forEach((beat) => {
      const beatEl = listEl.querySelector(
        `.beat-item[data-beat-id="${beat.id}"]`
      ) as HTMLElement;
      if (!beatEl) return;

      // Toggle collapse
      const header = beatEl.querySelector('.beat-header');
      header?.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        // Don't toggle if clicking on action buttons or select
        if (
          target.closest('.beat-actions') ||
          target.closest('.beat-type-select')
        ) {
          return;
        }
        this.handleBeatClick(beat.id);
      });

      // Drag events
      beatEl.draggable = true;
      beatEl.addEventListener('dragstart', (e) =>
        this.handleDragStart(e, beat.id)
      );
      beatEl.addEventListener('dragend', (e) => this.handleDragEnd(e));
      beatEl.addEventListener('dragover', (e) =>
        this.handleDragOver(e, beat.id)
      );
      beatEl.addEventListener('dragleave', (e) => this.handleDragLeave(e));
      beatEl.addEventListener('drop', (e) => this.handleDrop(e, beat.id));

      // Edit button
      const editBtn = beatEl.querySelector('.beat-edit-btn');
      editBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleEditStart(beat.id);
      });

      // Delete button
      const deleteBtn = beatEl.querySelector('.beat-delete-btn');
      deleteBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleDeleteBeat(beat.id);
      });

      // Type select
      const typeSelect = beatEl.querySelector(
        '.beat-type-select'
      ) as HTMLSelectElement;
      typeSelect?.addEventListener('change', (e) => {
        e.stopPropagation();
        this.handleTypeChange(beat.id, typeSelect.value as BeatType);
      });

      // Edit mode handlers
      if (this.editingBeatId === beat.id) {
        const saveBtn = beatEl.querySelector('.beat-save-btn');
        const cancelBtn = beatEl.querySelector('.beat-cancel-btn');
        const textarea = beatEl.querySelector(
          '.beat-content-edit'
        ) as HTMLTextAreaElement;

        saveBtn?.addEventListener('click', () => {
          this.handleEditSave(beat.id, textarea?.value || '');
        });
        cancelBtn?.addEventListener('click', () => this.handleEditCancel());

        // Save on Ctrl+Enter, cancel on Escape
        textarea?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            this.handleEditSave(beat.id, textarea.value);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            this.handleEditCancel();
          }
        });
      }
    });
  }

  private renderBeatItem(beat: NarrativeBeat, index: number): string {
    const colors = BEAT_COLORS[beat.type];
    const isCollapsed = this.collapsedBeats.has(beat.id);
    const isEditing = this.editingBeatId === beat.id;

    const speakerDisplay = beat.speaker ? ` - ${beat.speaker}` : '';
    const preview = beat.content.slice(0, 50) + (beat.content.length > 50 ? '...' : '');

    return `
      <div class="beat-item ${isCollapsed ? 'collapsed' : ''} ${isEditing ? 'editing' : ''}"
           data-beat-id="${beat.id}"
           style="--beat-bg: ${colors.bg}; --beat-border: ${colors.border};">
        <div class="beat-header">
          <span class="beat-drag-handle" title="Drag to reorder">⋮⋮</span>
          <span class="beat-index">${index + 1}</span>
          <span class="beat-icon">${colors.icon}</span>
          <select class="beat-type-select" title="Beat type">
            ${this.renderTypeOptions(beat.type)}
          </select>
          <span class="beat-speaker">${speakerDisplay}</span>
          <span class="beat-preview">${isCollapsed ? preview : ''}</span>
          <div class="beat-actions">
            <button class="beat-edit-btn" title="Edit">✏️</button>
            <button class="beat-delete-btn" title="Delete">🗑️</button>
            <span class="beat-collapse-icon">${isCollapsed ? '▶' : '▼'}</span>
          </div>
        </div>
        ${
          !isCollapsed
            ? `
          <div class="beat-body">
            ${
              isEditing
                ? `
              <textarea class="beat-content-edit">${this.escapeHtml(beat.content)}</textarea>
              <div class="beat-edit-actions">
                <button class="beat-save-btn">Save (Ctrl+Enter)</button>
                <button class="beat-cancel-btn">Cancel (Esc)</button>
              </div>
            `
                : `
              <div class="beat-content">${this.escapeHtml(beat.content)}</div>
            `
            }
            ${
              beat.metadata
                ? `
              <div class="beat-metadata">
                ${beat.metadata.emotion ? `<span class="beat-meta-item">Emotion: ${beat.metadata.emotion}</span>` : ''}
                ${beat.metadata.volume ? `<span class="beat-meta-item">Volume: ${beat.metadata.volume}</span>` : ''}
                ${beat.metadata.pace ? `<span class="beat-meta-item">Pace: ${beat.metadata.pace}</span>` : ''}
              </div>
            `
                : ''
            }
          </div>
        `
            : ''
        }
      </div>
    `;
  }

  private renderTypeOptions(currentType: BeatType): string {
    const types: BeatType[] = [
      'narration',
      'dialogue',
      'action',
      'thought',
      'sound',
      'transition',
    ];
    return types
      .map(
        (t) =>
          `<option value="${t}" ${t === currentType ? 'selected' : ''}>${t}</option>`
      )
      .join('');
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  private expandAll(): void {
    this.collapsedBeats.clear();
    this.renderBeats();
  }

  private collapseAll(): void {
    this.beats.forEach((b) => this.collapsedBeats.add(b.id));
    this.renderBeats();
  }

  private addNewBeat(): void {
    const newBeat: NarrativeBeat = {
      id: `beat-${Date.now()}`,
      type: 'narration',
      content: '',
    };
    this.beats.push(newBeat);
    this.renderBeats();
    this.updateBeatCount();
    this.handleEditStart(newBeat.id);
  }

  private updateBeatCount(): void {
    const countEl = this.container.querySelector('.beat-count');
    if (countEl) {
      countEl.textContent = `${this.beats.length} beat${this.beats.length !== 1 ? 's' : ''}`;
    }
  }

  private parseContentToBeats(content: string): NarrativeBeat[] {
    // Simple parsing: split by double newlines and create narration beats
    // This is a temporary solution until the server provides structured beats
    const paragraphs = content.split(/\n\n+/).filter((p) => p.trim());

    return paragraphs.map((p, i) => ({
      id: `beat-${Date.now()}-${i}`,
      type: this.inferBeatType(p),
      content: p.trim(),
      speaker: this.extractSpeaker(p),
    }));
  }

  private inferBeatType(text: string): BeatType {
    // Simple heuristics to infer beat type
    const lower = text.toLowerCase();

    // Check for dialogue patterns
    if (text.match(/^["']|["']$/) || text.includes('" ') || text.includes("' ")) {
      return 'dialogue';
    }

    // Check for action verbs at start
    if (
      text.match(
        /^(He|She|They|You|It|The)\s+(runs?|jumps?|attacks?|moves?|grabs?|throws?)/i
      )
    ) {
      return 'action';
    }

    // Check for thought patterns
    if (lower.includes('thinks') || lower.includes('wonders') || lower.includes('realizes')) {
      return 'thought';
    }

    // Check for sound effects
    if (text.match(/\*[^*]+\*/) || lower.includes('sound of') || lower.includes('noise')) {
      return 'sound';
    }

    // Check for transitions
    if (
      lower.includes('later') ||
      lower.includes('meanwhile') ||
      lower.includes('the next')
    ) {
      return 'transition';
    }

    return 'narration';
  }

  private extractSpeaker(text: string): string | undefined {
    // Try to extract speaker from dialogue patterns like "Name: text" or "Name says"
    const colonMatch = text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*:/);
    if (colonMatch) {
      return colonMatch[1];
    }

    const saysMatch = text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+says?/i);
    if (saysMatch) {
      return saysMatch[1];
    }

    return undefined;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ===========================================================================
  // Styles
  // ===========================================================================

  private injectStyles(): void {
    if (document.getElementById('beat-editor-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'beat-editor-styles';
    styles.textContent = `
      .beat-editor {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #0a0a0a;
        border: 1px solid #333;
        border-radius: 8px;
        overflow: hidden;
      }

      .beat-editor-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1rem;
        background: #111;
        border-bottom: 1px solid #333;
      }

      .beat-editor-title {
        font-weight: 600;
        color: #e0e0e0;
        font-size: 0.9rem;
      }

      .beat-editor-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .beat-action-btn {
        background: #222;
        border: 1px solid #444;
        color: #888;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.75rem;
      }

      .beat-action-btn:hover {
        background: #333;
        color: #fff;
      }

      .beat-count {
        font-size: 0.8rem;
        color: #666;
        margin-left: 0.5rem;
      }

      .beat-editor-content {
        flex: 1;
        overflow-y: auto;
        position: relative;
      }

      .beat-list {
        padding: 0.5rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .beat-editor-empty {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #555;
        gap: 0.5rem;
      }

      .beat-editor-hint {
        font-size: 0.8rem;
        color: #444;
      }

      .beat-editor-footer {
        padding: 0.5rem 1rem;
        background: #111;
        border-top: 1px solid #333;
      }

      .beat-add-btn {
        width: 100%;
        padding: 0.5rem;
        background: #1a1a2e;
        border: 1px dashed #4a4a6a;
        color: #888;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.85rem;
      }

      .beat-add-btn:hover {
        background: #222244;
        color: #aaa;
      }

      /* Beat Item */
      .beat-item {
        background: var(--beat-bg, #1a1a2e);
        border: 1px solid var(--beat-border, #4a4a6a);
        border-radius: 6px;
        overflow: hidden;
        transition: all 0.2s ease;
      }

      .beat-item:hover {
        border-color: #667eea;
      }

      .beat-item.dragging {
        opacity: 0.5;
        border-style: dashed;
      }

      .beat-item.drag-over {
        border-color: #667eea;
        border-width: 2px;
        box-shadow: 0 0 10px rgba(102, 126, 234, 0.3);
      }

      .beat-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.75rem;
        cursor: pointer;
        user-select: none;
      }

      .beat-header:hover {
        background: rgba(255, 255, 255, 0.03);
      }

      .beat-drag-handle {
        cursor: grab;
        color: #555;
        font-size: 0.9rem;
        letter-spacing: -2px;
      }

      .beat-drag-handle:hover {
        color: #888;
      }

      .beat-index {
        font-size: 0.75rem;
        color: #666;
        min-width: 1.5rem;
        text-align: center;
      }

      .beat-icon {
        font-size: 1rem;
      }

      .beat-type-select {
        background: transparent;
        border: 1px solid #444;
        color: #aaa;
        padding: 0.15rem 0.3rem;
        border-radius: 3px;
        font-size: 0.75rem;
        cursor: pointer;
      }

      .beat-type-select:hover {
        border-color: #667eea;
      }

      .beat-speaker {
        font-size: 0.8rem;
        color: #667eea;
        font-style: italic;
      }

      .beat-preview {
        flex: 1;
        font-size: 0.8rem;
        color: #666;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .beat-actions {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }

      .beat-edit-btn,
      .beat-delete-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 0.25rem;
        font-size: 0.85rem;
        opacity: 0.5;
        transition: opacity 0.2s;
      }

      .beat-edit-btn:hover,
      .beat-delete-btn:hover {
        opacity: 1;
      }

      .beat-collapse-icon {
        font-size: 0.7rem;
        color: #666;
        transition: transform 0.2s;
      }

      .beat-item.collapsed .beat-collapse-icon {
        transform: rotate(-90deg);
      }

      /* Beat Body */
      .beat-body {
        padding: 0.75rem;
        border-top: 1px solid var(--beat-border, #4a4a6a);
      }

      .beat-content {
        font-size: 0.9rem;
        color: #e0e0e0;
        line-height: 1.6;
        white-space: pre-wrap;
      }

      .beat-content-edit {
        width: 100%;
        min-height: 100px;
        padding: 0.5rem;
        background: #0a0a0a;
        border: 1px solid #444;
        border-radius: 4px;
        color: #e0e0e0;
        font-family: inherit;
        font-size: 0.9rem;
        line-height: 1.6;
        resize: vertical;
      }

      .beat-content-edit:focus {
        outline: none;
        border-color: #667eea;
      }

      .beat-edit-actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.5rem;
      }

      .beat-save-btn,
      .beat-cancel-btn {
        padding: 0.4rem 0.75rem;
        border-radius: 4px;
        font-size: 0.8rem;
        cursor: pointer;
      }

      .beat-save-btn {
        background: #667eea;
        border: none;
        color: white;
      }

      .beat-save-btn:hover {
        background: #5a6fd6;
      }

      .beat-cancel-btn {
        background: #333;
        border: 1px solid #444;
        color: #aaa;
      }

      .beat-cancel-btn:hover {
        background: #444;
      }

      .beat-metadata {
        display: flex;
        gap: 0.75rem;
        margin-top: 0.5rem;
        padding-top: 0.5rem;
        border-top: 1px dashed #333;
      }

      .beat-meta-item {
        font-size: 0.75rem;
        color: #666;
      }
    `;
    document.head.appendChild(styles);
  }
}
