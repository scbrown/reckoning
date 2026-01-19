/**
 * Emergence Notification Panel Component
 *
 * UI for DM to review emergence opportunities detected by the system.
 * Shows entity, emergence type (villain/ally), confidence, and key factors.
 * DM can acknowledge or dismiss notifications.
 */

import type { EmergenceNotification, EmergenceOpportunity } from '@reckoning/shared';

/**
 * Configuration for EmergenceNotificationPanel
 */
export interface EmergenceNotificationPanelConfig {
  containerId: string;
}

/**
 * Callbacks for notification actions
 */
export interface EmergenceNotificationCallbacks {
  onAcknowledge: (notificationId: string, dmNotes?: string) => void;
  onDismiss: (notificationId: string, dmNotes?: string) => void;
}

/**
 * Emergence Notification Panel component for DM review
 */
export class EmergenceNotificationPanel {
  private container: HTMLElement;
  private callbacks: EmergenceNotificationCallbacks;
  private notifications: EmergenceNotification[] = [];
  private selectedId: string | null = null;

  constructor(config: EmergenceNotificationPanelConfig, callbacks: EmergenceNotificationCallbacks) {
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
   * Update the list of notifications
   */
  setNotifications(notifications: EmergenceNotification[]): void {
    this.notifications = notifications.filter(n => n.status === 'pending');
    // Clear selection if selected notification is no longer pending
    if (this.selectedId && !this.notifications.find(n => n.id === this.selectedId)) {
      this.selectedId = null;
    }
    this.updateDOM();
  }

  /**
   * Add a new notification (from SSE)
   */
  addNotification(notification: EmergenceNotification): void {
    // Avoid duplicates
    if (this.notifications.some(n => n.id === notification.id)) {
      return;
    }
    this.notifications.unshift(notification);
    this.updateDOM();
  }

  /**
   * Remove a notification by ID
   */
  removeNotification(id: string): void {
    this.notifications = this.notifications.filter(n => n.id !== id);
    if (this.selectedId === id) {
      this.selectedId = null;
    }
    this.updateDOM();
  }

  /**
   * Select a notification by ID
   */
  selectNotification(id: string | null): void {
    this.selectedId = id;
    this.updateDOM();
  }

  /**
   * Check if there are pending notifications
   */
  hasPending(): boolean {
    return this.notifications.length > 0;
  }

  /**
   * Get count of pending notifications
   */
  getCount(): number {
    return this.notifications.length;
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
    const count = this.notifications.length;
    const selected = this.selectedId
      ? this.notifications.find(n => n.id === this.selectedId)
      : null;

    this.container.innerHTML = `
      <div class="emergence-notification-panel">
        <div class="emergence-header">
          <h3>Emergence Alerts</h3>
          ${count > 0 ? `<span class="emergence-badge">${count}</span>` : ''}
        </div>
        ${count === 0 ? this.renderEmptyState() : this.renderContent(selected)}
      </div>
    `;

    this.attachEventListeners();
  }

  private renderEmptyState(): string {
    return `
      <div class="emergence-empty">
        <span class="emergence-empty-text">No emergence alerts</span>
      </div>
    `;
  }

  private renderContent(selected: EmergenceNotification | null | undefined): string {
    return `
      <div class="emergence-list" role="listbox" aria-label="Emergence notifications">
        ${this.notifications.map(notification => this.renderListItem(notification)).join('')}
      </div>
      ${selected ? this.renderDetails(selected) : ''}
    `;
  }

  private renderListItem(notification: EmergenceNotification): string {
    const isSelected = notification.id === this.selectedId;
    const opportunity = notification.opportunity;
    const typeLabel = opportunity.type === 'villain' ? 'Villain' : 'Ally';
    const entityLabel = this.formatEntityLabel(opportunity.entity.type, opportunity.entity.id);
    const confidencePercent = Math.round(opportunity.confidence * 100);

    return `
      <div
        class="emergence-item ${isSelected ? 'selected' : ''} emergence-type-${opportunity.type}"
        role="option"
        aria-selected="${isSelected}"
        data-notification-id="${notification.id}"
        tabindex="${isSelected ? '0' : '-1'}"
      >
        <div class="emergence-item-header">
          <span class="emergence-type-badge emergence-badge-${opportunity.type}">${typeLabel}</span>
          <span class="emergence-confidence">${confidencePercent}%</span>
        </div>
        <div class="emergence-item-entity">${entityLabel}</div>
        <div class="emergence-item-reason">${this.truncateText(opportunity.reason, 60)}</div>
      </div>
    `;
  }

  private renderDetails(notification: EmergenceNotification): string {
    const opportunity = notification.opportunity;
    const typeLabel = opportunity.type === 'villain' ? 'Villain Emergence' : 'Ally Emergence';
    const entityLabel = this.formatEntityLabel(opportunity.entity.type, opportunity.entity.id);
    const confidencePercent = Math.round(opportunity.confidence * 100);

    return `
      <div class="emergence-details">
        <div class="emergence-detail-row">
          <span class="detail-label">Type:</span>
          <span class="detail-value emergence-badge-${opportunity.type}">${typeLabel}</span>
        </div>
        <div class="emergence-detail-row">
          <span class="detail-label">Entity:</span>
          <span class="detail-value">${entityLabel}</span>
        </div>
        <div class="emergence-detail-row">
          <span class="detail-label">Confidence:</span>
          <span class="detail-value">
            <span class="confidence-bar">
              <span class="confidence-fill" style="width: ${confidencePercent}%"></span>
            </span>
            <span class="confidence-value">${confidencePercent}%</span>
          </span>
        </div>
        ${this.renderContributingFactors(opportunity)}
        <div class="emergence-detail-row emergence-reason">
          <span class="detail-label">Analysis:</span>
          <span class="detail-value">${this.escapeHtml(opportunity.reason)}</span>
        </div>
        <div class="emergence-notes">
          <label for="dm-notes">DM Notes (optional):</label>
          <input
            type="text"
            id="dm-notes"
            class="dm-notes-input"
            placeholder="Add notes..."
            aria-label="DM notes for emergence notification"
          />
        </div>
        <div class="emergence-actions" role="toolbar" aria-label="Notification actions">
          <button class="btn btn-acknowledge" data-action="acknowledge" title="Acknowledge this emergence opportunity">
            Acknowledge
          </button>
          <button class="btn btn-dismiss" data-action="dismiss" title="Dismiss this notification">
            Dismiss
          </button>
        </div>
      </div>
    `;
  }

  private renderContributingFactors(opportunity: EmergenceOpportunity): string {
    if (!opportunity.contributingFactors.length) {
      return '';
    }

    const factors = opportunity.contributingFactors.map(factor => {
      const valuePercent = Math.round(factor.value * 100);
      const thresholdPercent = Math.round(factor.threshold * 100);
      const dimension = this.formatDimension(factor.dimension);

      return `
        <div class="factor-item">
          <span class="factor-dimension">${dimension}</span>
          <span class="factor-bar">
            <span class="factor-fill ${this.getFactorClass(factor.dimension)}" style="width: ${valuePercent}%"></span>
            <span class="factor-threshold" style="left: ${thresholdPercent}%"></span>
          </span>
          <span class="factor-value">${valuePercent}%</span>
        </div>
      `;
    }).join('');

    return `
      <div class="emergence-factors">
        <span class="factors-label">Contributing Factors:</span>
        <div class="factors-list">
          ${factors}
        </div>
      </div>
    `;
  }

  private attachEventListeners(): void {
    // List item selection
    const items = this.container.querySelectorAll('.emergence-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-notification-id');
        if (id) {
          this.selectNotification(id);
        }
      });
      item.addEventListener('keydown', (e) => {
        const event = e as KeyboardEvent;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          const id = item.getAttribute('data-notification-id');
          if (id) {
            this.selectNotification(id);
          }
        }
      });
    });

    // Action buttons
    const acknowledgeBtn = this.container.querySelector('[data-action="acknowledge"]');
    const dismissBtn = this.container.querySelector('[data-action="dismiss"]');

    acknowledgeBtn?.addEventListener('click', () => this.handleAcknowledge());
    dismissBtn?.addEventListener('click', () => this.handleDismiss());
  }

  private handleAcknowledge(): void {
    if (!this.selectedId) return;

    const notesInput = this.container.querySelector('.dm-notes-input') as HTMLInputElement;
    const dmNotes = notesInput?.value.trim() || undefined;

    this.callbacks.onAcknowledge(this.selectedId, dmNotes);
  }

  private handleDismiss(): void {
    if (!this.selectedId) return;

    const notesInput = this.container.querySelector('.dm-notes-input') as HTMLInputElement;
    const dmNotes = notesInput?.value.trim() || undefined;

    this.callbacks.onDismiss(this.selectedId, dmNotes);
  }

  private formatEntityLabel(type: string, id: string): string {
    const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
    // Truncate long IDs for display
    const shortId = id.length > 16 ? id.slice(0, 16) + '...' : id;
    return `${typeLabel}: ${shortId}`;
  }

  private formatDimension(dimension: string): string {
    return dimension.charAt(0).toUpperCase() + dimension.slice(1);
  }

  private getFactorClass(dimension: string): string {
    const negative = ['fear', 'resentment'];
    return negative.includes(dimension) ? 'factor-negative' : 'factor-positive';
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private injectStyles(): void {
    if (document.getElementById('emergence-notification-panel-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'emergence-notification-panel-styles';
    styles.textContent = `
      .emergence-notification-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #111;
        border: 1px solid #333;
        border-radius: 6px;
        overflow: hidden;
      }

      .emergence-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1rem;
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        border-bottom: 1px solid #333;
      }

      .emergence-header h3 {
        margin: 0;
        font-size: 0.95rem;
        color: white;
        font-weight: 600;
      }

      .emergence-badge {
        background: rgba(255, 255, 255, 0.2);
        color: white;
        padding: 0.15rem 0.5rem;
        border-radius: 10px;
        font-size: 0.8rem;
        font-weight: 600;
      }

      .emergence-empty {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
      }

      .emergence-empty-text {
        color: #666;
        font-style: italic;
        font-size: 0.9rem;
      }

      .emergence-list {
        flex: 0 0 auto;
        max-height: 200px;
        overflow-y: auto;
        border-bottom: 1px solid #333;
      }

      .emergence-item {
        padding: 0.75rem 1rem;
        border-bottom: 1px solid #2a2a2a;
        cursor: pointer;
        transition: background 0.2s;
      }

      .emergence-item:last-child {
        border-bottom: none;
      }

      .emergence-item:hover {
        background: #1a1a1a;
      }

      .emergence-item.selected {
        background: #222;
        border-left: 3px solid #f59e0b;
        padding-left: calc(1rem - 3px);
      }

      .emergence-item.emergence-type-villain {
        border-left-color: #dc2626;
      }

      .emergence-item.emergence-type-ally {
        border-left-color: #16a34a;
      }

      .emergence-item:focus {
        outline: 2px solid #f59e0b;
        outline-offset: -2px;
      }

      .emergence-item-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.35rem;
      }

      .emergence-type-badge {
        font-size: 0.7rem;
        padding: 0.15rem 0.4rem;
        border-radius: 3px;
        font-weight: 600;
        text-transform: uppercase;
      }

      .emergence-badge-villain {
        background: rgba(220, 38, 38, 0.2);
        color: #f87171;
      }

      .emergence-badge-ally {
        background: rgba(22, 163, 74, 0.2);
        color: #4ade80;
      }

      .emergence-confidence {
        font-size: 0.75rem;
        color: #888;
        font-family: monospace;
      }

      .emergence-item-entity {
        font-size: 0.85rem;
        color: #e0e0e0;
        margin-bottom: 0.25rem;
      }

      .emergence-item-reason {
        font-size: 0.8rem;
        color: #888;
        font-style: italic;
      }

      .emergence-details {
        flex: 1;
        padding: 0.75rem 1rem;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .emergence-detail-row {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
      }

      .detail-label {
        flex: 0 0 80px;
        font-size: 0.8rem;
        color: #888;
        font-weight: 500;
      }

      .detail-value {
        flex: 1;
        font-size: 0.85rem;
        color: #e0e0e0;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .confidence-bar {
        flex: 1;
        height: 8px;
        background: #333;
        border-radius: 4px;
        overflow: hidden;
        max-width: 100px;
      }

      .confidence-fill {
        height: 100%;
        background: linear-gradient(90deg, #f59e0b, #d97706);
        border-radius: 4px;
      }

      .confidence-value {
        font-family: monospace;
        font-size: 0.8rem;
        color: #888;
        min-width: 35px;
      }

      .emergence-factors {
        padding: 0.5rem;
        background: #1a1a1a;
        border-radius: 4px;
      }

      .factors-label {
        display: block;
        font-size: 0.8rem;
        color: #888;
        margin-bottom: 0.5rem;
      }

      .factors-list {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }

      .factor-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .factor-dimension {
        flex: 0 0 70px;
        font-size: 0.75rem;
        color: #aaa;
      }

      .factor-bar {
        flex: 1;
        height: 6px;
        background: #333;
        border-radius: 3px;
        position: relative;
        overflow: visible;
      }

      .factor-fill {
        height: 100%;
        border-radius: 3px;
      }

      .factor-fill.factor-positive {
        background: linear-gradient(90deg, #22c55e, #16a34a);
      }

      .factor-fill.factor-negative {
        background: linear-gradient(90deg, #f87171, #dc2626);
      }

      .factor-threshold {
        position: absolute;
        top: -2px;
        width: 2px;
        height: 10px;
        background: #888;
      }

      .factor-value {
        flex: 0 0 35px;
        font-size: 0.75rem;
        color: #888;
        font-family: monospace;
        text-align: right;
      }

      .emergence-reason {
        flex-direction: column;
        gap: 0.25rem;
      }

      .emergence-reason .detail-value {
        padding: 0.5rem;
        background: #1a1a1a;
        border-radius: 4px;
        font-style: italic;
        line-height: 1.4;
      }

      .emergence-notes {
        margin-top: 0.5rem;
        padding-top: 0.5rem;
        border-top: 1px solid #2a2a2a;
      }

      .emergence-notes label {
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
        border-color: #f59e0b;
      }

      .emergence-actions {
        display: flex;
        gap: 0.5rem;
        margin-top: auto;
        padding-top: 0.5rem;
      }

      .emergence-actions .btn {
        flex: 1;
        padding: 0.6rem 0.75rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 500;
        transition: all 0.2s;
      }

      .emergence-actions .btn:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
      }

      .emergence-actions .btn:active:not(:disabled) {
        transform: translateY(0);
      }

      .emergence-actions .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .emergence-actions .btn:focus {
        outline: 2px solid #f59e0b;
        outline-offset: 2px;
      }

      .emergence-actions .btn-acknowledge {
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        color: white;
      }

      .emergence-actions .btn-dismiss {
        background: #333;
        color: #888;
      }

      .emergence-actions .btn-dismiss:hover:not(:disabled) {
        background: #444;
        color: #aaa;
      }
    `;
    document.head.appendChild(styles);
  }
}
