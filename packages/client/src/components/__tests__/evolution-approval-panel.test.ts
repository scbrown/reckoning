/**
 * Evolution Approval Panel Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EvolutionApprovalPanel,
  type PendingEvolution,
  type EvolutionApprovalCallbacks,
} from '../evolution-approval-panel.js';

describe('EvolutionApprovalPanel', () => {
  let container: HTMLElement;
  let callbacks: EvolutionApprovalCallbacks;

  const mockEvolutions: PendingEvolution[] = [
    {
      id: 'evo-1',
      gameId: 'game-1',
      turn: 5,
      evolutionType: 'trait_add',
      entityType: 'npc',
      entityId: 'marcus',
      trait: 'suspicious',
      reason: 'Marcus noticed the party acting strangely.',
      sourceEventId: 'event-123',
      status: 'pending',
      createdAt: '2026-01-18T12:00:00Z',
    },
    {
      id: 'evo-2',
      gameId: 'game-1',
      turn: 6,
      evolutionType: 'relationship_change',
      entityType: 'npc',
      entityId: 'elena',
      targetType: 'player',
      targetId: 'hero',
      dimension: 'trust',
      oldValue: 0.5,
      newValue: 0.7,
      reason: 'The player helped Elena escape danger.',
      status: 'pending',
      createdAt: '2026-01-18T12:30:00Z',
    },
    {
      id: 'evo-3',
      gameId: 'game-1',
      turn: 7,
      evolutionType: 'trait_remove',
      entityType: 'player',
      entityId: 'hero',
      trait: 'naive',
      reason: 'After witnessing betrayal, the hero has lost their innocence.',
      status: 'pending',
      createdAt: '2026-01-18T13:00:00Z',
    },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);

    callbacks = {
      onApprove: vi.fn(),
      onEdit: vi.fn(),
      onRefuse: vi.fn(),
    };
  });

  afterEach(() => {
    document.body.removeChild(container);
    // Remove injected styles
    const styles = document.getElementById('evolution-approval-panel-styles');
    if (styles) styles.remove();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw if container not found', () => {
      expect(
        () => new EvolutionApprovalPanel({ containerId: 'non-existent' }, callbacks)
      ).toThrow('Container element #non-existent not found');
    });

    it('should create panel successfully', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      expect(panel).toBeInstanceOf(EvolutionApprovalPanel);
    });

    it('should inject styles', () => {
      new EvolutionApprovalPanel({ containerId: 'test-container' }, callbacks);
      const styles = document.getElementById('evolution-approval-panel-styles');
      expect(styles).not.toBeNull();
    });
  });

  describe('render', () => {
    it('should show empty state when no evolutions', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();

      const emptyText = container.querySelector('.evolution-empty-text');
      expect(emptyText).not.toBeNull();
      expect(emptyText?.textContent).toBe('No pending evolutions');
    });

    it('should render evolution list', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      panel.setPendingEvolutions(mockEvolutions);

      const items = container.querySelectorAll('.evolution-item');
      expect(items.length).toBe(3);
    });

    it('should show badge count', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      panel.setPendingEvolutions(mockEvolutions);

      const badge = container.querySelector('.evolution-badge');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe('3');
    });
  });

  describe('evolution item display', () => {
    it('should display trait_add evolution correctly', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      const evo = mockEvolutions[0];
      if (!evo) throw new Error('Expected evolution');
      panel.setPendingEvolutions([evo]);

      const item = container.querySelector('.evolution-item');
      expect(item).not.toBeNull();

      const typeBadge = item?.querySelector('.evolution-type-badge');
      expect(typeBadge?.textContent).toBe('Add Trait');
      expect(typeBadge?.classList.contains('evolution-type-trait_add')).toBe(true);

      const change = item?.querySelector('.evolution-item-change');
      expect(change?.textContent).toBe('+ suspicious');
    });

    it('should display relationship_change evolution correctly', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      const evo = mockEvolutions[1];
      if (!evo) throw new Error('Expected evolution');
      panel.setPendingEvolutions([evo]);

      const item = container.querySelector('.evolution-item');
      expect(item).not.toBeNull();

      const typeBadge = item?.querySelector('.evolution-type-badge');
      expect(typeBadge?.textContent).toBe('Relationship');

      const change = item?.querySelector('.evolution-item-change');
      expect(change?.textContent).toBe('trust +20%');
    });

    it('should display trait_remove evolution correctly', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      const evo = mockEvolutions[2];
      if (!evo) throw new Error('Expected evolution');
      panel.setPendingEvolutions([evo]);

      const item = container.querySelector('.evolution-item');
      const change = item?.querySelector('.evolution-item-change');
      expect(change?.textContent).toBe('- naive');
    });
  });

  describe('selection', () => {
    it('should select evolution on click', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      panel.setPendingEvolutions(mockEvolutions);

      const item = container.querySelector('[data-evolution-id="evo-1"]') as HTMLElement;
      item?.click();

      // Re-query after click since DOM is rebuilt
      const selectedItem = container.querySelector('[data-evolution-id="evo-1"]');
      expect(selectedItem?.classList.contains('selected')).toBe(true);

      // Should show details
      const details = container.querySelector('.evolution-details');
      expect(details).not.toBeNull();
    });

    it('should show action buttons when evolution selected', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      panel.setPendingEvolutions(mockEvolutions);
      panel.selectEvolution('evo-1');

      const approveBtn = container.querySelector('[data-action="approve"]');
      const editBtn = container.querySelector('[data-action="edit"]');
      const refuseBtn = container.querySelector('[data-action="refuse"]');

      expect(approveBtn).not.toBeNull();
      expect(editBtn).not.toBeNull();
      expect(refuseBtn).not.toBeNull();
    });

    it('should clear selection when evolution no longer pending', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      panel.setPendingEvolutions(mockEvolutions);
      panel.selectEvolution('evo-1');

      // Simulate the evolution being resolved
      panel.setPendingEvolutions(mockEvolutions.slice(1));

      const selected = container.querySelector('.evolution-item.selected');
      expect(selected).toBeNull();
    });
  });

  describe('callbacks', () => {
    it('should call onApprove when approve button clicked', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      panel.setPendingEvolutions(mockEvolutions);
      panel.selectEvolution('evo-1');

      const approveBtn = container.querySelector('[data-action="approve"]') as HTMLButtonElement;
      approveBtn?.click();

      expect(callbacks.onApprove).toHaveBeenCalledWith('evo-1', undefined);
    });

    it('should call onApprove with DM notes', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      panel.setPendingEvolutions(mockEvolutions);
      panel.selectEvolution('evo-1');

      const notesInput = container.querySelector('.dm-notes-input') as HTMLInputElement;
      notesInput.value = 'Approved with caution';

      const approveBtn = container.querySelector('[data-action="approve"]') as HTMLButtonElement;
      approveBtn?.click();

      expect(callbacks.onApprove).toHaveBeenCalledWith('evo-1', 'Approved with caution');
    });

    it('should call onRefuse when refuse button clicked', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      panel.setPendingEvolutions(mockEvolutions);
      panel.selectEvolution('evo-2');

      const refuseBtn = container.querySelector('[data-action="refuse"]') as HTMLButtonElement;
      refuseBtn?.click();

      expect(callbacks.onRefuse).toHaveBeenCalledWith('evo-2', undefined);
    });

    it('should enter edit mode when edit button clicked', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      panel.setPendingEvolutions(mockEvolutions);
      panel.selectEvolution('evo-1');

      const editBtn = container.querySelector('[data-action="edit"]') as HTMLButtonElement;
      editBtn?.click();

      // Should show edit form
      const editMode = container.querySelector('.evolution-edit-mode');
      expect(editMode).not.toBeNull();

      // Should have edit input for trait
      const traitInput = container.querySelector('#edit-trait') as HTMLInputElement;
      expect(traitInput).not.toBeNull();
      expect(traitInput.value).toBe('suspicious');
    });

    it('should call onEdit with changes when save edit clicked', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      panel.setPendingEvolutions(mockEvolutions);
      panel.selectEvolution('evo-1');

      // Enter edit mode
      const editBtn = container.querySelector('[data-action="edit"]') as HTMLButtonElement;
      editBtn?.click();

      // Modify the trait
      const traitInput = container.querySelector('#edit-trait') as HTMLInputElement;
      traitInput.value = 'wary';
      traitInput.dispatchEvent(new Event('input'));

      // Save the edit
      const saveBtn = container.querySelector('[data-action="save-edit"]') as HTMLButtonElement;
      saveBtn?.click();

      expect(callbacks.onEdit).toHaveBeenCalledWith(
        'evo-1',
        expect.objectContaining({ trait: 'wary' }),
        undefined
      );
    });

    it('should cancel edit mode when cancel clicked', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      panel.setPendingEvolutions(mockEvolutions);
      panel.selectEvolution('evo-1');

      // Enter edit mode
      const editBtn = container.querySelector('[data-action="edit"]') as HTMLButtonElement;
      editBtn?.click();

      // Cancel
      const cancelBtn = container.querySelector('[data-action="cancel-edit"]') as HTMLButtonElement;
      cancelBtn?.click();

      // Should exit edit mode
      const editMode = container.querySelector('.evolution-edit-mode');
      expect(editMode).toBeNull();

      // Should show normal action buttons again
      const approveBtn = container.querySelector('[data-action="approve"]');
      expect(approveBtn).not.toBeNull();
    });
  });

  describe('relationship evolution editing', () => {
    it('should show slider for relationship value editing', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      const evo = mockEvolutions[1];
      if (!evo) throw new Error('Expected evolution');
      panel.setPendingEvolutions([evo]);
      panel.selectEvolution('evo-2');

      // Enter edit mode
      const editBtn = container.querySelector('[data-action="edit"]') as HTMLButtonElement;
      editBtn?.click();

      const slider = container.querySelector('#edit-value') as HTMLInputElement;
      expect(slider).not.toBeNull();
      expect(slider.type).toBe('range');
      expect(slider.value).toBe('70'); // 0.7 * 100
    });

    it('should update slider value display', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      const evo = mockEvolutions[1];
      if (!evo) throw new Error('Expected evolution');
      panel.setPendingEvolutions([evo]);
      panel.selectEvolution('evo-2');

      // Enter edit mode
      const editBtn = container.querySelector('[data-action="edit"]') as HTMLButtonElement;
      editBtn?.click();

      const slider = container.querySelector('#edit-value') as HTMLInputElement;
      slider.value = '85';
      slider.dispatchEvent(new Event('input'));

      const valueDisplay = container.querySelector('.edit-slider-value');
      expect(valueDisplay?.textContent).toBe('85%');
    });
  });

  describe('hasPending', () => {
    it('should return false when no evolutions', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      expect(panel.hasPending()).toBe(false);
    });

    it('should return true when evolutions exist', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.setPendingEvolutions(mockEvolutions);
      expect(panel.hasPending()).toBe(true);
    });

    it('should filter out non-pending evolutions', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      const resolvedEvolution: PendingEvolution = {
        id: 'evo-resolved',
        gameId: 'game-1',
        turn: 5,
        evolutionType: 'trait_add',
        entityType: 'npc',
        entityId: 'marcus',
        trait: 'suspicious',
        reason: 'Test reason',
        sourceEventId: 'event-123',
        status: 'approved',
        createdAt: '2026-01-18T12:00:00Z',
        resolvedAt: '2026-01-18T14:00:00Z',
      };
      panel.setPendingEvolutions([resolvedEvolution]);
      expect(panel.hasPending()).toBe(false);
    });
  });

  describe('destroy', () => {
    it('should clear container on destroy', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      panel.setPendingEvolutions(mockEvolutions);

      panel.destroy();

      expect(container.innerHTML).toBe('');
    });
  });

  describe('keyboard navigation', () => {
    it('should support Enter key for selection', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      panel.setPendingEvolutions(mockEvolutions);

      const item = container.querySelector('[data-evolution-id="evo-1"]') as HTMLElement;
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      item?.dispatchEvent(event);

      // Re-query after keydown since DOM is rebuilt
      const selectedItem = container.querySelector('[data-evolution-id="evo-1"]');
      expect(selectedItem?.classList.contains('selected')).toBe(true);
    });

    it('should support Space key for selection', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      panel.setPendingEvolutions(mockEvolutions);

      const item = container.querySelector('[data-evolution-id="evo-2"]') as HTMLElement;
      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
      item?.dispatchEvent(event);

      // Re-query after keydown since DOM is rebuilt
      const selectedItem = container.querySelector('[data-evolution-id="evo-2"]');
      expect(selectedItem?.classList.contains('selected')).toBe(true);
    });
  });

  describe('evolution details display', () => {
    it('should show entity information', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      panel.setPendingEvolutions(mockEvolutions);
      panel.selectEvolution('evo-1');

      const entityValue = container.querySelector('.evolution-details .detail-value');
      expect(entityValue?.textContent).toContain('Npc');
      expect(entityValue?.textContent).toContain('marcus');
    });

    it('should show reason', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      panel.setPendingEvolutions(mockEvolutions);
      panel.selectEvolution('evo-1');

      const reasonRow = container.querySelector('.evolution-reason .detail-value');
      expect(reasonRow?.textContent).toBe('Marcus noticed the party acting strangely.');
    });

    it('should show source event ID', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      panel.setPendingEvolutions(mockEvolutions);
      panel.selectEvolution('evo-1');

      const sourceValue = container.querySelector('.evolution-source');
      expect(sourceValue).not.toBeNull();
      expect(sourceValue?.textContent).toContain('event-12');
    });

    it('should show relationship change details', () => {
      const panel = new EvolutionApprovalPanel(
        { containerId: 'test-container' },
        callbacks
      );
      panel.render();
      panel.setPendingEvolutions(mockEvolutions);
      panel.selectEvolution('evo-2');

      const dimensionBadge = container.querySelector('.dimension-badge');
      expect(dimensionBadge?.textContent).toBe('Trust');

      const changeValue = container.querySelector('.relationship-change');
      expect(changeValue?.textContent).toContain('50%');
      expect(changeValue?.textContent).toContain('70%');
    });
  });
});
