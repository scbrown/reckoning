import { describe, it, expect } from 'vitest';
import type { CanonicalEvent } from '@reckoning/shared/game';
import {
  detectTraitsFromEvent,
  detectTraitsFromPatterns,
  detectRelationshipsFromEvent,
  aggregateRelationshipChanges,
  traitDetectionToEvolutionInput,
  relationshipDetectionToEvolutionInput,
} from '../system-evolution-detector.js';

function createEvent(overrides: Partial<CanonicalEvent>): CanonicalEvent {
  return {
    id: 'event-1',
    gameId: 'game-1',
    turn: 1,
    timestamp: '2026-01-18T00:00:00Z',
    eventType: 'party_action',
    content: 'The player does something.',
    locationId: 'area-1',
    witnesses: [],
    ...overrides,
  };
}

describe('system-evolution-detector', () => {
  describe('detectTraitsFromEvent', () => {
    it('should detect merciful trait from mercy keywords', () => {
      const event = createEvent({
        content: 'The player chose to spare the defeated bandit, showing mercy.',
      });

      const detections = detectTraitsFromEvent(event, 'player', 'player-1');

      expect(detections).toHaveLength(1);
      expect(detections[0].trait).toBe('merciful');
      expect(detections[0].entityType).toBe('player');
      expect(detections[0].entityId).toBe('player-1');
    });

    it('should detect ruthless trait from ruthless keywords', () => {
      const event = createEvent({
        content: 'With no mercy, the player executed the prisoner in cold blood.',
      });

      const detections = detectTraitsFromEvent(event, 'player', 'player-1');

      // Should detect ruthless (contains "execute" and "no mercy")
      const ruthless = detections.find(d => d.trait === 'ruthless');
      expect(ruthless).toBeDefined();
    });

    it('should detect scholarly trait from knowledge keywords', () => {
      const event = createEvent({
        content: 'The player spent hours studying the ancient tome.',
      });

      const detections = detectTraitsFromEvent(event, 'player', 'player-1');

      const scholarly = detections.find(d => d.trait === 'scholarly');
      expect(scholarly).toBeDefined();
    });

    it('should detect battle-hardened trait from combat keywords', () => {
      const event = createEvent({
        content: 'After the fierce battle, the player stood victorious over the slain dragon.',
      });

      const detections = detectTraitsFromEvent(event, 'player', 'player-1');

      const battleHardened = detections.find(d => d.trait === 'battle-hardened');
      expect(battleHardened).toBeDefined();
    });

    it('should detect multiple traits from complex event', () => {
      const event = createEvent({
        content: 'The cunning player used a clever trick to outsmart the guards and survive the night.',
      });

      const detections = detectTraitsFromEvent(event, 'player', 'player-1');

      const cunning = detections.find(d => d.trait === 'cunning');
      const streetWise = detections.find(d => d.trait === 'street-wise');

      expect(cunning).toBeDefined();
      expect(streetWise).toBeDefined();
    });

    it('should return empty array when no traits detected', () => {
      const event = createEvent({
        content: 'The player walked through the quiet forest.',
      });

      const detections = detectTraitsFromEvent(event, 'player', 'player-1');

      expect(detections).toHaveLength(0);
    });
  });

  describe('detectTraitsFromPatterns', () => {
    it('should suggest trait when threshold is met', () => {
      const events = [
        createEvent({ turn: 1, content: 'The player showed mercy to the wounded goblin.' }),
        createEvent({ turn: 2, content: 'Spare the orc, the player commanded.' }),
        createEvent({ turn: 3, content: 'With compassion, the player released the prisoner.' }),
      ];

      const detections = detectTraitsFromPatterns(events, 'player', 'player-1', 3);

      expect(detections).toHaveLength(1);
      expect(detections[0].trait).toBe('merciful');
      expect(detections[0].reason).toContain('3 occurrences');
    });

    it('should not suggest trait below threshold', () => {
      const events = [
        createEvent({ turn: 1, content: 'The player showed mercy to the wounded goblin.' }),
        createEvent({ turn: 2, content: 'The player walked through town.' }),
      ];

      const detections = detectTraitsFromPatterns(events, 'player', 'player-1', 3);

      expect(detections).toHaveLength(0);
    });

    it('should detect multiple traits meeting threshold', () => {
      const events = [
        createEvent({ turn: 1, content: 'The player studied the ancient tome.' }),
        createEvent({ turn: 2, content: 'Spent the day researching in the library.' }),
        createEvent({ turn: 3, content: 'Gained knowledge from the wizard.' }),
        createEvent({ turn: 4, content: 'The battle was fierce and bloody.' }),
        createEvent({ turn: 5, content: 'Another victory in combat.' }),
        createEvent({ turn: 6, content: 'The player emerged from the fight victorious.' }),
      ];

      const detections = detectTraitsFromPatterns(events, 'player', 'player-1', 3);

      const scholarly = detections.find(d => d.trait === 'scholarly');
      const battleHardened = detections.find(d => d.trait === 'battle-hardened');

      expect(scholarly).toBeDefined();
      expect(battleHardened).toBeDefined();
    });
  });

  describe('detectRelationshipsFromEvent', () => {
    it('should detect trust increase from help keywords', () => {
      const event = createEvent({
        content: 'The player helped the wounded merchant.',
      });

      const detections = detectRelationshipsFromEvent(
        event,
        'player',
        'player-1',
        'npc',
        'merchant-1'
      );

      const trustChange = detections.find(d => d.dimension === 'trust');
      expect(trustChange).toBeDefined();
      expect(trustChange!.change).toBeGreaterThan(0);
    });

    it('should detect trust decrease from betrayal keywords', () => {
      const event = createEvent({
        content: 'The player chose to betray the alliance.',
      });

      const detections = detectRelationshipsFromEvent(
        event,
        'player',
        'player-1',
        'npc',
        'ally-1'
      );

      const trustChange = detections.find(d => d.dimension === 'trust');
      const resentmentChange = detections.find(d => d.dimension === 'resentment');

      expect(trustChange).toBeDefined();
      expect(trustChange!.change).toBeLessThan(0);
      expect(resentmentChange).toBeDefined();
      expect(resentmentChange!.change).toBeGreaterThan(0);
    });

    it('should detect fear increase from intimidation', () => {
      const event = createEvent({
        content: 'The player used threats to intimidate the guard.',
      });

      const detections = detectRelationshipsFromEvent(
        event,
        'player',
        'player-1',
        'npc',
        'guard-1'
      );

      const fearChange = detections.find(d => d.dimension === 'fear');
      expect(fearChange).toBeDefined();
      expect(fearChange!.change).toBeGreaterThan(0);
    });

    it('should detect respect increase from honorable actions', () => {
      const event = createEvent({
        content: 'The player fought with honor and achieved victory.',
      });

      const detections = detectRelationshipsFromEvent(
        event,
        'player',
        'player-1',
        'npc',
        'warrior-1'
      );

      const respectChange = detections.find(d => d.dimension === 'respect');
      expect(respectChange).toBeDefined();
      expect(respectChange!.change).toBeGreaterThan(0);
    });

    it('should detect changes for witnesses when no target specified', () => {
      const event = createEvent({
        content: 'The player helped save the village from the fire.',
        witnesses: ['witness-1', 'witness-2'],
      });

      const detections = detectRelationshipsFromEvent(event, 'player', 'player-1');

      // Should have changes for both witnesses
      expect(detections.length).toBeGreaterThanOrEqual(2);

      // Witness relationships should have reduced change (0.5x)
      for (const detection of detections) {
        expect(detection.fromType).toBe('npc');
        expect(['witness-1', 'witness-2']).toContain(detection.fromId);
      }
    });
  });

  describe('aggregateRelationshipChanges', () => {
    it('should aggregate changes across multiple events', () => {
      const events = [
        createEvent({ turn: 1, content: 'The player helped the merchant.' }),
        createEvent({ turn: 2, content: 'The player protected the merchant from thieves.' }),
        createEvent({ turn: 3, content: 'The player was honest about the goods.' }),
      ];

      const detections = aggregateRelationshipChanges(
        events,
        'player',
        'player-1',
        'npc',
        'merchant-1'
      );

      const trustChange = detections.find(d => d.dimension === 'trust');
      expect(trustChange).toBeDefined();
      // Aggregated trust should be significant (>= 0.1)
      expect(Math.abs(trustChange!.change)).toBeGreaterThanOrEqual(0.1);
    });

    it('should return empty for insignificant changes', () => {
      const events = [
        createEvent({ turn: 1, content: 'The player walked by.' }),
      ];

      const detections = aggregateRelationshipChanges(
        events,
        'player',
        'player-1',
        'npc',
        'npc-1'
      );

      expect(detections).toHaveLength(0);
    });
  });

  describe('traitDetectionToEvolutionInput', () => {
    it('should convert detection to evolution input', () => {
      const detection = {
        entityType: 'player' as const,
        entityId: 'player-1',
        trait: 'merciful',
        reason: 'Test reason',
      };

      const input = traitDetectionToEvolutionInput(
        detection,
        'game-1',
        5,
        'event-1'
      );

      expect(input.gameId).toBe('game-1');
      expect(input.turn).toBe(5);
      expect(input.evolutionType).toBe('trait_add');
      expect(input.entityType).toBe('player');
      expect(input.entityId).toBe('player-1');
      expect(input.trait).toBe('merciful');
      expect(input.reason).toBe('Test reason');
      expect(input.sourceEventId).toBe('event-1');
    });
  });

  describe('relationshipDetectionToEvolutionInput', () => {
    it('should convert detection to evolution input with clamped value', () => {
      const detection = {
        fromType: 'npc' as const,
        fromId: 'npc-1',
        toType: 'player' as const,
        toId: 'player-1',
        dimension: 'trust' as const,
        change: 0.2,
        reason: 'Test reason',
      };

      const input = relationshipDetectionToEvolutionInput(
        detection,
        'game-1',
        5,
        0.5, // current value
        'event-1'
      );

      expect(input.evolutionType).toBe('relationship_change');
      expect(input.entityType).toBe('npc');
      expect(input.entityId).toBe('npc-1');
      expect(input.targetType).toBe('player');
      expect(input.targetId).toBe('player-1');
      expect(input.dimension).toBe('trust');
      expect(input.oldValue).toBe(0.5);
      expect(input.newValue).toBe(0.7);
    });

    it('should clamp new value to 0-1 range', () => {
      const detection = {
        fromType: 'npc' as const,
        fromId: 'npc-1',
        toType: 'player' as const,
        toId: 'player-1',
        dimension: 'trust' as const,
        change: 0.5,
        reason: 'Test reason',
      };

      const input = relationshipDetectionToEvolutionInput(
        detection,
        'game-1',
        5,
        0.8, // current value
      );

      expect(input.newValue).toBe(1.0); // Clamped to max

      const inputNegative = relationshipDetectionToEvolutionInput(
        { ...detection, change: -0.5 },
        'game-1',
        5,
        0.2,
      );

      expect(inputNegative.newValue).toBe(0); // Clamped to min
    });
  });
});
