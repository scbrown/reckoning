import { describe, it, expect } from 'vitest';
import {
  computeLabels,
  getShortLabel,
  getLabelValence,
  type RelationshipLabel,
} from '../label-computation.js';
import type { Relationship } from '../../../db/repositories/relationship-repository.js';

/**
 * Helper to create a relationship with specific dimension values
 */
function createRelationship(overrides: Partial<Relationship> = {}): Relationship {
  return {
    id: 'rel-1',
    gameId: 'game-1',
    from: { type: 'npc', id: 'npc-1' },
    to: { type: 'player', id: 'player-1' },
    trust: 0.5,
    respect: 0.5,
    affection: 0.5,
    fear: 0.0,
    resentment: 0.0,
    debt: 0.0,
    updatedTurn: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('computeLabels', () => {
  describe('indifferent relationships', () => {
    it('should label default values as indifferent', () => {
      const relationship = createRelationship();
      const result = computeLabels(relationship);

      expect(result.primary).toBe('indifferent');
      expect(result.labels.some(l => l.label === 'indifferent')).toBe(true);
    });

    it('should label near-neutral values as indifferent', () => {
      const relationship = createRelationship({
        trust: 0.55,
        respect: 0.45,
        affection: 0.52,
      });
      const result = computeLabels(relationship);

      expect(result.primary).toBe('indifferent');
    });
  });

  describe('positive relationships', () => {
    it('should label high trust, respect, and affection as devoted', () => {
      const relationship = createRelationship({
        trust: 0.9,
        respect: 0.85,
        affection: 0.9,
        fear: 0.0,
        resentment: 0.0,
      });
      const result = computeLabels(relationship);

      expect(result.primary).toBe('devoted');
      expect(result.summary).toContain('devoted');
    });

    it('should label high trust and respect as allied', () => {
      const relationship = createRelationship({
        trust: 0.8,
        respect: 0.8,
        affection: 0.5,
        fear: 0.1,
        resentment: 0.1,
      });
      const result = computeLabels(relationship);

      expect(result.primary).toBe('allied');
    });

    it('should label moderate-high trust and affection as friendly', () => {
      const relationship = createRelationship({
        trust: 0.65,
        respect: 0.5,
        affection: 0.6,
        fear: 0.1,
        resentment: 0.1,
      });
      const result = computeLabels(relationship);

      expect(result.primary).toBe('friendly');
    });

    it('should include trusted label for high trust', () => {
      const relationship = createRelationship({
        trust: 0.85,
        respect: 0.5,
        affection: 0.5,
      });
      const result = computeLabels(relationship);

      expect(result.labels.some(l => l.label === 'trusted')).toBe(true);
    });

    it('should include respected label for high respect', () => {
      const relationship = createRelationship({
        trust: 0.5,
        respect: 0.85,
        affection: 0.5,
      });
      const result = computeLabels(relationship);

      expect(result.labels.some(l => l.label === 'respected')).toBe(true);
    });

    it('should include beloved label for very high affection', () => {
      const relationship = createRelationship({
        trust: 0.5,
        respect: 0.5,
        affection: 0.9,
      });
      const result = computeLabels(relationship);

      expect(result.labels.some(l => l.label === 'beloved')).toBe(true);
    });
  });

  describe('negative relationships', () => {
    it('should label high resentment and low trust as hostile', () => {
      const relationship = createRelationship({
        trust: 0.15,
        respect: 0.3,
        affection: 0.2,
        fear: 0.1,
        resentment: 0.85,
      });
      const result = computeLabels(relationship);

      expect(result.primary).toBe('hostile');
    });

    it('should label competitive tension as rival', () => {
      const relationship = createRelationship({
        trust: 0.4,
        respect: 0.2,
        affection: 0.3,
        fear: 0.2,
        resentment: 0.5,
      });
      const result = computeLabels(relationship);

      expect(result.primary).toBe('rival');
    });

    it('should include resented label for high resentment', () => {
      const relationship = createRelationship({
        trust: 0.5,
        respect: 0.5,
        affection: 0.5,
        resentment: 0.7,
      });
      const result = computeLabels(relationship);

      expect(result.labels.some(l => l.label === 'resented')).toBe(true);
    });
  });

  describe('fear-based relationships', () => {
    it('should label very high fear as terrified', () => {
      const relationship = createRelationship({
        trust: 0.2,
        respect: 0.6,
        affection: 0.1,
        fear: 0.9,
        resentment: 0.2,
      });
      const result = computeLabels(relationship);

      expect(result.primary).toBe('terrified');
    });

    it('should label moderate-high fear as feared', () => {
      const relationship = createRelationship({
        trust: 0.3,
        respect: 0.5,
        affection: 0.3,
        fear: 0.6,
        resentment: 0.1,
      });
      const result = computeLabels(relationship);

      expect(result.labels.some(l => l.label === 'feared')).toBe(true);
    });

    it('should label low fear with low trust as wary', () => {
      const relationship = createRelationship({
        trust: 0.35,
        respect: 0.5,
        affection: 0.4,
        fear: 0.35,
        resentment: 0.1,
      });
      const result = computeLabels(relationship);

      expect(result.labels.some(l => l.label === 'wary')).toBe(true);
    });
  });

  describe('debt-based relationships', () => {
    it('should include indebted label for high debt', () => {
      const relationship = createRelationship({
        trust: 0.6,
        respect: 0.6,
        affection: 0.5,
        debt: 0.7,
      });
      const result = computeLabels(relationship);

      expect(result.labels.some(l => l.label === 'indebted')).toBe(true);
    });
  });

  describe('complex relationships', () => {
    it('should handle mixed positive and negative feelings', () => {
      const relationship = createRelationship({
        trust: 0.7,
        respect: 0.8,
        affection: 0.3,
        fear: 0.4,
        resentment: 0.3,
      });
      const result = computeLabels(relationship);

      // Should still recognize positive aspects
      expect(result.labels.some(l => l.label === 'respected')).toBe(true);
    });

    it('should handle fear combined with resentment', () => {
      const relationship = createRelationship({
        trust: 0.1,
        respect: 0.3,
        affection: 0.1,
        fear: 0.8,
        resentment: 0.6,
      });
      const result = computeLabels(relationship);

      expect(result.primary).toBe('terrified');
      expect(result.labels.some(l => l.label === 'resented')).toBe(true);
    });

    it('should return multiple applicable labels', () => {
      const relationship = createRelationship({
        trust: 0.9,
        respect: 0.85,
        affection: 0.9,
        debt: 0.6,
      });
      const result = computeLabels(relationship);

      expect(result.labels.length).toBeGreaterThan(1);
    });
  });

  describe('summary generation', () => {
    it('should generate appropriate summary for indifferent', () => {
      const relationship = createRelationship();
      const result = computeLabels(relationship);

      expect(result.summary).toBe('No strong feelings either way');
    });

    it('should generate appropriate summary for devoted', () => {
      const relationship = createRelationship({
        trust: 0.9,
        respect: 0.85,
        affection: 0.9,
      });
      const result = computeLabels(relationship);

      expect(result.summary).toMatch(/devoted/i);
    });

    it('should generate appropriate summary for hostile', () => {
      const relationship = createRelationship({
        trust: 0.15,
        respect: 0.3,
        affection: 0.2,
        fear: 0.1,
        resentment: 0.85,
      });
      const result = computeLabels(relationship);

      expect(result.summary).toMatch(/hostile/i);
    });
  });
});

describe('getShortLabel', () => {
  it('should capitalize the label', () => {
    expect(getShortLabel('devoted')).toBe('Devoted');
    expect(getShortLabel('hostile')).toBe('Hostile');
    expect(getShortLabel('indifferent')).toBe('Indifferent');
  });
});

describe('getLabelValence', () => {
  it('should return positive for positive labels', () => {
    const positiveLabels: RelationshipLabel[] = [
      'devoted', 'allied', 'friendly', 'trusted', 'respected', 'beloved'
    ];

    for (const label of positiveLabels) {
      expect(getLabelValence(label)).toBe('positive');
    }
  });

  it('should return negative for negative labels', () => {
    const negativeLabels: RelationshipLabel[] = [
      'hostile', 'rival', 'resented', 'terrified', 'feared'
    ];

    for (const label of negativeLabels) {
      expect(getLabelValence(label)).toBe('negative');
    }
  });

  it('should return neutral for neutral labels', () => {
    const neutralLabels: RelationshipLabel[] = ['wary', 'indebted', 'indifferent'];

    for (const label of neutralLabels) {
      expect(getLabelValence(label)).toBe('neutral');
    }
  });
});
