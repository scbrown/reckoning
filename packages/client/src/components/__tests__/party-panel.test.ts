import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PartyPanel } from '../party-panel.js';
import type { Character } from '@reckoning/shared';

// =============================================================================
// Mock Data
// =============================================================================

function createMockCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char-1',
    name: 'Test Character',
    description: 'A test character',
    class: 'Warrior',
    stats: {
      health: 80,
      maxHealth: 100,
    },
    ...overrides,
  };
}

function createMockParty(): Character[] {
  return [
    createMockCharacter({
      id: 'player-1',
      name: 'Hero Player',
      class: 'Warrior',
      stats: { health: 85, maxHealth: 100 },
    }),
    createMockCharacter({
      id: 'char-2',
      name: 'Ally One',
      class: 'Healer',
      stats: { health: 45, maxHealth: 60 },
    }),
    createMockCharacter({
      id: 'char-3',
      name: 'Ally Two',
      class: 'Rogue',
      stats: { health: 30, maxHealth: 50 },
    }),
  ];
}

// =============================================================================
// Tests
// =============================================================================

describe('PartyPanel', () => {
  let container: HTMLElement;

  beforeEach(() => {
    // Create a container element for the panel
    container = document.createElement('div');
    container.id = 'test-party-panel';
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Clean up the container
    document.body.removeChild(container);
    // Remove injected styles
    const styles = document.getElementById('party-panel-styles');
    if (styles) {
      styles.remove();
    }
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw if container element is not found', () => {
      expect(() => {
        new PartyPanel({ containerId: 'non-existent' });
      }).toThrow('Container element #non-existent not found');
    });

    it('should initialize with default mock party', () => {
      const panel = new PartyPanel({ containerId: 'test-party-panel' });
      const members = panel.getMembers();
      expect(members.length).toBe(3);
    });

    it('should store playerId when provided', () => {
      const panel = new PartyPanel({
        containerId: 'test-party-panel',
        playerId: 'player-1',
      });
      expect(panel.getPlayerId()).toBe('player-1');
    });
  });

  describe('render', () => {
    it('should create correct DOM structure', () => {
      const panel = new PartyPanel({ containerId: 'test-party-panel' });
      panel.render();

      // Check panel structure
      const partyPanel = container.querySelector('.party-panel');
      expect(partyPanel).not.toBeNull();

      // Check header
      const header = container.querySelector('.party-panel-header');
      expect(header).not.toBeNull();
      expect(header?.querySelector('h3')?.textContent).toBe('Party');

      // Check members container
      const membersContainer = container.querySelector('.party-panel-members');
      expect(membersContainer).not.toBeNull();
      expect(membersContainer?.getAttribute('role')).toBe('list');

      // Check character cards
      const cards = container.querySelectorAll('.character-card');
      expect(cards.length).toBe(3);
    });

    it('should render character cards with correct content', () => {
      const panel = new PartyPanel({ containerId: 'test-party-panel' });
      panel.render();

      const firstCard = container.querySelector('.character-card');
      expect(firstCard).not.toBeNull();

      // Check name
      const name = firstCard?.querySelector('.character-name');
      expect(name).not.toBeNull();

      // Check role
      const role = firstCard?.querySelector('.character-role');
      expect(role).not.toBeNull();

      // Check health bar
      const healthBar = firstCard?.querySelector('.health-bar');
      expect(healthBar).not.toBeNull();

      // Check health text
      const healthText = firstCard?.querySelector('.health-text');
      expect(healthText).not.toBeNull();
    });

    it('should set correct accessibility attributes', () => {
      const panel = new PartyPanel({ containerId: 'test-party-panel' });
      panel.render();

      const card = container.querySelector('.character-card');
      expect(card?.getAttribute('role')).toBe('listitem');
      expect(card?.getAttribute('tabindex')).toBe('0');
      expect(card?.getAttribute('aria-label')).toContain('health');
    });

    it('should display health bar with correct width', () => {
      const panel = new PartyPanel({ containerId: 'test-party-panel' });
      panel.setMembers([
        createMockCharacter({
          stats: { health: 50, maxHealth: 100 },
        }),
      ]);
      panel.render();

      const healthFill = container.querySelector('.health-fill') as HTMLElement;
      expect(healthFill).not.toBeNull();
      expect(healthFill.style.width).toBe('50%');
    });

    it('should apply correct health class for good health', () => {
      const panel = new PartyPanel({ containerId: 'test-party-panel' });
      panel.setMembers([
        createMockCharacter({
          stats: { health: 80, maxHealth: 100 },
        }),
      ]);
      panel.render();

      const healthFill = container.querySelector('.health-fill');
      expect(healthFill?.classList.contains('health-good')).toBe(true);
    });

    it('should apply correct health class for low health', () => {
      const panel = new PartyPanel({ containerId: 'test-party-panel' });
      panel.setMembers([
        createMockCharacter({
          stats: { health: 40, maxHealth: 100 },
        }),
      ]);
      panel.render();

      const healthFill = container.querySelector('.health-fill');
      expect(healthFill?.classList.contains('health-low')).toBe(true);
    });

    it('should apply correct health class for critical health', () => {
      const panel = new PartyPanel({ containerId: 'test-party-panel' });
      panel.setMembers([
        createMockCharacter({
          stats: { health: 20, maxHealth: 100 },
        }),
      ]);
      panel.render();

      const healthFill = container.querySelector('.health-fill');
      expect(healthFill?.classList.contains('health-critical')).toBe(true);
    });
  });

  describe('setMembers (update)', () => {
    it('should re-render on party change', () => {
      const panel = new PartyPanel({ containerId: 'test-party-panel' });
      panel.render();

      // Initial state has 3 members
      expect(container.querySelectorAll('.character-card').length).toBe(3);

      // Update to 2 members
      panel.setMembers([
        createMockCharacter({ id: 'new-1', name: 'New Character 1' }),
        createMockCharacter({ id: 'new-2', name: 'New Character 2' }),
      ]);

      // Should now have 2 cards
      expect(container.querySelectorAll('.character-card').length).toBe(2);
    });

    it('should update character data correctly', () => {
      const panel = new PartyPanel({ containerId: 'test-party-panel' });
      panel.render();

      const updatedMember = createMockCharacter({
        id: 'updated-1',
        name: 'Updated Hero',
        class: 'Mage',
        stats: { health: 25, maxHealth: 100 },
      });

      panel.setMembers([updatedMember]);

      const nameElement = container.querySelector('.character-name');
      expect(nameElement?.textContent).toBe('Updated Hero');

      const roleElement = container.querySelector('.character-role');
      expect(roleElement?.textContent).toBe('Mage');

      const healthText = container.querySelector('.health-text');
      expect(healthText?.textContent).toBe('25/100');
    });

    it('should return updated members via getMembers', () => {
      const panel = new PartyPanel({ containerId: 'test-party-panel' });
      const newParty = createMockParty();
      panel.setMembers(newParty);

      const members = panel.getMembers();
      expect(members.length).toBe(3);
      expect(members[0]?.name).toBe('Hero Player');
    });

    it('should return a copy of members, not the original array', () => {
      const panel = new PartyPanel({ containerId: 'test-party-panel' });
      const newParty = createMockParty();
      panel.setMembers(newParty);

      const members = panel.getMembers();
      members.push(createMockCharacter());

      // Original should not be affected
      expect(panel.getMembers().length).toBe(3);
    });
  });

  describe('player character distinction', () => {
    it('should visually distinguish player character', () => {
      const party = createMockParty();
      const panel = new PartyPanel({
        containerId: 'test-party-panel',
        playerId: 'player-1',
      });
      panel.setMembers(party);
      panel.render();

      const playerCard = container.querySelector(
        '[data-character-id="player-1"]'
      );
      expect(playerCard?.classList.contains('character-card--player')).toBe(
        true
      );
    });

    it('should not apply player class to non-player characters', () => {
      const party = createMockParty();
      const panel = new PartyPanel({
        containerId: 'test-party-panel',
        playerId: 'player-1',
      });
      panel.setMembers(party);
      panel.render();

      const nonPlayerCard = container.querySelector(
        '[data-character-id="char-2"]'
      );
      expect(nonPlayerCard?.classList.contains('character-card--player')).toBe(
        false
      );
    });

    it('should display player badge for player character', () => {
      const party = createMockParty();
      const panel = new PartyPanel({
        containerId: 'test-party-panel',
        playerId: 'player-1',
      });
      panel.setMembers(party);
      panel.render();

      const playerCard = container.querySelector(
        '[data-character-id="player-1"]'
      );
      const badge = playerCard?.querySelector('.player-badge');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe('YOU');
    });

    it('should not display player badge for non-player characters', () => {
      const party = createMockParty();
      const panel = new PartyPanel({
        containerId: 'test-party-panel',
        playerId: 'player-1',
      });
      panel.setMembers(party);
      panel.render();

      const nonPlayerCard = container.querySelector(
        '[data-character-id="char-2"]'
      );
      const badge = nonPlayerCard?.querySelector('.player-badge');
      expect(badge).toBeNull();
    });

    it('should include player designation in aria-label', () => {
      const party = createMockParty();
      const panel = new PartyPanel({
        containerId: 'test-party-panel',
        playerId: 'player-1',
      });
      panel.setMembers(party);
      panel.render();

      const playerCard = container.querySelector(
        '[data-character-id="player-1"]'
      );
      expect(playerCard?.getAttribute('aria-label')).toContain(
        'player character'
      );
    });

    it('should update player distinction when playerId changes', () => {
      const party = createMockParty();
      const panel = new PartyPanel({
        containerId: 'test-party-panel',
        playerId: 'player-1',
      });
      panel.setMembers(party);
      panel.render();

      // Initially player-1 is the player
      expect(
        container
          .querySelector('[data-character-id="player-1"]')
          ?.classList.contains('character-card--player')
      ).toBe(true);

      // Change player to char-2
      panel.setPlayerId('char-2');

      // Now char-2 should be the player
      expect(
        container
          .querySelector('[data-character-id="char-2"]')
          ?.classList.contains('character-card--player')
      ).toBe(true);
      expect(
        container
          .querySelector('[data-character-id="player-1"]')
          ?.classList.contains('character-card--player')
      ).toBe(false);
    });
  });

  describe('destroy', () => {
    it('should clear container content', () => {
      const panel = new PartyPanel({ containerId: 'test-party-panel' });
      panel.render();

      expect(container.innerHTML).not.toBe('');

      panel.destroy();

      expect(container.innerHTML).toBe('');
    });
  });

  describe('edge cases', () => {
    it('should handle empty party', () => {
      const panel = new PartyPanel({ containerId: 'test-party-panel' });
      panel.setMembers([]);
      panel.render();

      const cards = container.querySelectorAll('.character-card');
      expect(cards.length).toBe(0);
    });

    it('should handle zero maxHealth gracefully', () => {
      const panel = new PartyPanel({ containerId: 'test-party-panel' });
      panel.setMembers([
        createMockCharacter({
          stats: { health: 0, maxHealth: 0 },
        }),
      ]);
      panel.render();

      const healthFill = container.querySelector('.health-fill') as HTMLElement;
      expect(healthFill.style.width).toBe('0%');
    });

    it('should escape HTML in character names', () => {
      const panel = new PartyPanel({ containerId: 'test-party-panel' });
      panel.setMembers([
        createMockCharacter({
          name: '<script>alert("xss")</script>',
        }),
      ]);
      panel.render();

      const nameElement = container.querySelector('.character-name');
      expect(nameElement?.textContent).toBe('<script>alert("xss")</script>');
      expect(nameElement?.innerHTML).not.toContain('<script>');
    });

    it('should handle playerId that does not match any character', () => {
      const party = createMockParty();
      const panel = new PartyPanel({
        containerId: 'test-party-panel',
        playerId: 'non-existent-id',
      });
      panel.setMembers(party);
      panel.render();

      // No character should have the player class
      const playerCards = container.querySelectorAll('.character-card--player');
      expect(playerCards.length).toBe(0);
    });
  });
});
