import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmergenceObserver } from '../emergence-observer.js';
import type {
  EmergenceObserverConfig,
  EmergenceEventEmitter,
  EmergenceEvent,
} from '../emergence-observer.js';
import type { CanonicalEvent } from '@reckoning/shared/game';
import type { Relationship, Entity } from '../../../db/repositories/relationship-repository.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockRelationship(overrides: Partial<Relationship> = {}): Relationship {
  return {
    id: 'rel_1',
    gameId: 'game_1',
    from: { type: 'npc', id: 'npc_1' },
    to: { type: 'player', id: 'player' },
    trust: 0.5,
    respect: 0.5,
    affection: 0.5,
    fear: 0.0,
    resentment: 0.0,
    debt: 0.0,
    updatedTurn: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockEvent(overrides: Partial<CanonicalEvent> = {}): CanonicalEvent {
  return {
    id: 'event_1',
    gameId: 'game_1',
    turn: 1,
    timestamp: new Date().toISOString(),
    eventType: 'party_action',
    content: 'The party attacks the goblin.',
    locationId: 'area_1',
    witnesses: [],
    actorType: 'player',
    actorId: 'player',
    targetType: 'npc',
    targetId: 'goblin_1',
    action: 'attack_first',
    ...overrides,
  };
}

function createMockConfig(): EmergenceObserverConfig {
  return {
    relationshipRepo: {
      findByEntity: vi.fn().mockReturnValue([]),
      findBetween: vi.fn().mockReturnValue(null),
      findByThreshold: vi.fn().mockReturnValue([]),
      upsert: vi.fn(),
      findById: vi.fn(),
      updateDimension: vi.fn(),
      delete: vi.fn(),
      deleteByGame: vi.fn(),
      deleteByEntity: vi.fn(),
    } as any,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('EmergenceObserver', () => {
  let observer: EmergenceObserver;
  let config: EmergenceObserverConfig;
  let emittedEvents: EmergenceEvent[];

  beforeEach(() => {
    config = createMockConfig();
    emittedEvents = [];
    config.eventEmitter = {
      emit: (event: EmergenceEvent) => emittedEvents.push(event),
    };
    observer = new EmergenceObserver(config);
  });

  describe('onEventCommitted', () => {
    it('should return empty opportunities when event has no actor', () => {
      const event = createMockEvent({ actorType: undefined, actorId: undefined });

      const result = observer.onEventCommitted(event);

      expect(result.opportunities).toHaveLength(0);
      expect(result.eventId).toBe(event.id);
    });

    it('should check relationships for the actor', () => {
      const event = createMockEvent();

      observer.onEventCommitted(event);

      expect(config.relationshipRepo.findByEntity).toHaveBeenCalledWith(
        'game_1',
        { type: 'player', id: 'player' }
      );
    });

    it('should also check relationships for the target when target is NPC', () => {
      const event = createMockEvent({
        targetType: 'npc',
        targetId: 'goblin_1',
      });

      observer.onEventCommitted(event);

      expect(config.relationshipRepo.findByEntity).toHaveBeenCalledWith(
        'game_1',
        { type: 'npc', id: 'goblin_1' }
      );
    });

    it('should detect villain emergence from high fear + resentment', () => {
      const villainRelationship = createMockRelationship({
        from: { type: 'npc', id: 'goblin_1' },
        to: { type: 'player', id: 'player' },
        fear: 0.85,
        resentment: 0.8,
        trust: 0.1,
        respect: 0.2,
      });

      (config.relationshipRepo.findByEntity as any).mockReturnValue([villainRelationship]);

      const event = createMockEvent();
      const result = observer.onEventCommitted(event);

      expect(result.opportunities.length).toBeGreaterThan(0);
      const villainOpp = result.opportunities.find(o => o.type === 'villain');
      expect(villainOpp).toBeDefined();
      expect(villainOpp?.entity.id).toBe('goblin_1');
    });

    it('should detect ally emergence from high trust + respect', () => {
      const allyRelationship = createMockRelationship({
        from: { type: 'npc', id: 'merchant_1' },
        to: { type: 'player', id: 'player' },
        trust: 0.85,
        respect: 0.85,
        affection: 0.5,
        fear: 0.0,
        resentment: 0.0,
      });

      (config.relationshipRepo.findByEntity as any).mockReturnValue([allyRelationship]);

      const event = createMockEvent();
      const result = observer.onEventCommitted(event);

      expect(result.opportunities.length).toBeGreaterThan(0);
      const allyOpp = result.opportunities.find(o => o.type === 'ally');
      expect(allyOpp).toBeDefined();
      expect(allyOpp?.entity.id).toBe('merchant_1');
    });

    it('should emit events when emergence is detected', () => {
      const villainRelationship = createMockRelationship({
        from: { type: 'npc', id: 'goblin_1' },
        to: { type: 'player', id: 'player' },
        fear: 0.8,
        resentment: 0.7,
        trust: 0.1,
      });

      (config.relationshipRepo.findByEntity as any).mockReturnValue([villainRelationship]);

      const event = createMockEvent();
      observer.onEventCommitted(event);

      expect(emittedEvents.length).toBeGreaterThan(0);
      expect(emittedEvents.some(e => e.type === 'emergence:villain')).toBe(true);
      expect(emittedEvents.some(e => e.type === 'emergence:detected')).toBe(true);
    });

    it('should not emit events when no emergence detected', () => {
      (config.relationshipRepo.findByEntity as any).mockReturnValue([]);

      const event = createMockEvent();
      observer.onEventCommitted(event);

      expect(emittedEvents.length).toBe(0);
    });

    it('should avoid duplicate opportunities', () => {
      // Both actor and target perspective might find the same NPC
      const relationship = createMockRelationship({
        from: { type: 'npc', id: 'goblin_1' },
        to: { type: 'player', id: 'player' },
        fear: 0.8,
        resentment: 0.7,
      });

      // First call for actor, second for target
      (config.relationshipRepo.findByEntity as any)
        .mockReturnValueOnce([relationship])
        .mockReturnValueOnce([relationship]);

      const event = createMockEvent({ targetId: 'goblin_1' });
      const result = observer.onEventCommitted(event);

      // Should deduplicate
      const villainOpps = result.opportunities.filter(o => o.type === 'villain');
      expect(villainOpps.length).toBe(1);
    });
  });

  describe('checkVillainEmergence', () => {
    it('should return null when fear is below threshold', () => {
      const relationship = createMockRelationship({
        fear: 0.4, // Below 0.6 threshold
        resentment: 0.7,
      });
      const entity: Entity = { type: 'npc', id: 'npc_1' };
      const event = createMockEvent();

      const result = observer.checkVillainEmergence(relationship, entity, event);

      expect(result).toBeNull();
    });

    it('should return null when resentment is below threshold', () => {
      const relationship = createMockRelationship({
        fear: 0.7,
        resentment: 0.3, // Below 0.5 threshold
      });
      const entity: Entity = { type: 'npc', id: 'npc_1' };
      const event = createMockEvent();

      const result = observer.checkVillainEmergence(relationship, entity, event);

      expect(result).toBeNull();
    });

    it('should return opportunity when both thresholds met', () => {
      const relationship = createMockRelationship({
        fear: 0.85,
        resentment: 0.8,
        trust: 0.1,
        respect: 0.2,
      });
      const entity: Entity = { type: 'npc', id: 'villain_npc' };
      const event = createMockEvent();

      const result = observer.checkVillainEmergence(relationship, entity, event);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('villain');
      expect(result?.entity).toEqual(entity);
      expect(result?.triggeringEventId).toBe(event.id);
    });

    it('should include contributing factors', () => {
      const relationship = createMockRelationship({
        fear: 0.8,
        resentment: 0.7,
        trust: 0.2,
        respect: 0.3,
      });
      const entity: Entity = { type: 'npc', id: 'npc_1' };
      const event = createMockEvent();

      const result = observer.checkVillainEmergence(relationship, entity, event);

      expect(result?.contributingFactors).toContainEqual(
        expect.objectContaining({ dimension: 'fear' })
      );
      expect(result?.contributingFactors).toContainEqual(
        expect.objectContaining({ dimension: 'resentment' })
      );
    });

    it('should generate descriptive reason', () => {
      const relationship = createMockRelationship({
        fear: 0.9,
        resentment: 0.8,
        trust: 0.1,
        respect: 0.2,
      });
      const entity: Entity = { type: 'npc', id: 'npc_1' };
      const event = createMockEvent();

      const result = observer.checkVillainEmergence(relationship, entity, event);

      expect(result?.reason).toContain('fears');
      expect(result?.reason).toContain('resentment');
    });
  });

  describe('checkAllyEmergence', () => {
    it('should return null when neither path is met', () => {
      const relationship = createMockRelationship({
        trust: 0.4,
        respect: 0.4,
        affection: 0.4,
      });
      const entity: Entity = { type: 'npc', id: 'npc_1' };
      const event = createMockEvent();

      const result = observer.checkAllyEmergence(relationship, entity, event);

      expect(result).toBeNull();
    });

    it('should detect ally via trust + respect path', () => {
      const relationship = createMockRelationship({
        trust: 0.85,
        respect: 0.85,
        affection: 0.3,
        fear: 0.0,
        resentment: 0.0,
      });
      const entity: Entity = { type: 'npc', id: 'loyal_guard' };
      const event = createMockEvent();

      const result = observer.checkAllyEmergence(relationship, entity, event);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('ally');
      expect(result?.entity).toEqual(entity);
    });

    it('should detect ally via friendship path', () => {
      const relationship = createMockRelationship({
        trust: 0.55,
        respect: 0.4,
        affection: 0.7,
        fear: 0.1,
        resentment: 0.1,
      });
      const entity: Entity = { type: 'npc', id: 'friendly_merchant' };
      const event = createMockEvent();

      const result = observer.checkAllyEmergence(relationship, entity, event);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('ally');
    });

    it('should detect ally via debt path', () => {
      const relationship = createMockRelationship({
        trust: 0.4,
        respect: 0.6,
        affection: 0.3,
        debt: 0.85,
        fear: 0.0,
        resentment: 0.0,
      });
      const entity: Entity = { type: 'npc', id: 'indebted_npc' };
      const event = createMockEvent();

      const result = observer.checkAllyEmergence(relationship, entity, event);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('ally');
    });

    it('should block ally emergence when fear is high', () => {
      const relationship = createMockRelationship({
        trust: 0.7,
        respect: 0.7,
        fear: 0.6, // High fear blocks ally
        resentment: 0.1,
      });
      const entity: Entity = { type: 'npc', id: 'npc_1' };
      const event = createMockEvent();

      const result = observer.checkAllyEmergence(relationship, entity, event);

      expect(result).toBeNull();
    });

    it('should block ally emergence when resentment is high', () => {
      const relationship = createMockRelationship({
        trust: 0.7,
        respect: 0.7,
        fear: 0.1,
        resentment: 0.6, // High resentment blocks ally
      });
      const entity: Entity = { type: 'npc', id: 'npc_1' };
      const event = createMockEvent();

      const result = observer.checkAllyEmergence(relationship, entity, event);

      expect(result).toBeNull();
    });

    it('should include contributing factors', () => {
      const relationship = createMockRelationship({
        trust: 0.8,
        respect: 0.8,
        affection: 0.7,
        fear: 0.1,
        resentment: 0.1,
      });
      const entity: Entity = { type: 'npc', id: 'npc_1' };
      const event = createMockEvent();

      const result = observer.checkAllyEmergence(relationship, entity, event);

      expect(result?.contributingFactors.length).toBeGreaterThan(0);
    });

    it('should generate descriptive reason', () => {
      const relationship = createMockRelationship({
        trust: 0.9,
        respect: 0.9,
        fear: 0.1,
        resentment: 0.1,
      });
      const entity: Entity = { type: 'npc', id: 'npc_1' };
      const event = createMockEvent();

      const result = observer.checkAllyEmergence(relationship, entity, event);

      expect(result?.reason).toContain('trust');
      expect(result?.reason).toContain('respect');
    });
  });

  describe('calculateConfidence', () => {
    it('should return higher confidence for extreme villain values', () => {
      const lowConf = observer.calculateConfidence('villain', {
        fear: 0.6,
        resentment: 0.5,
        trust: 0.5,
        respect: 0.5,
        affection: 0.5,
        debt: 0.0,
      });

      const highConf = observer.calculateConfidence('villain', {
        fear: 0.95,
        resentment: 0.9,
        trust: 0.1,
        respect: 0.2,
        affection: 0.1,
        debt: 0.0,
      });

      expect(highConf).toBeGreaterThan(lowConf);
    });

    it('should return higher confidence for extreme ally values', () => {
      const lowConf = observer.calculateConfidence('ally', {
        fear: 0.2,
        resentment: 0.2,
        trust: 0.6,
        respect: 0.6,
        affection: 0.5,
        debt: 0.0,
      });

      const highConf = observer.calculateConfidence('ally', {
        fear: 0.0,
        resentment: 0.0,
        trust: 0.95,
        respect: 0.95,
        affection: 0.9,
        debt: 0.5,
      });

      expect(highConf).toBeGreaterThan(lowConf);
    });

    it('should penalize villain confidence for high respect', () => {
      const noRespect = observer.calculateConfidence('villain', {
        fear: 0.8,
        resentment: 0.8,
        trust: 0.1,
        respect: 0.2,
        affection: 0.1,
        debt: 0.0,
      });

      const withRespect = observer.calculateConfidence('villain', {
        fear: 0.8,
        resentment: 0.8,
        trust: 0.1,
        respect: 0.7, // High respect
        affection: 0.1,
        debt: 0.0,
      });

      expect(noRespect).toBeGreaterThan(withRespect);
    });

    it('should penalize ally confidence for fear', () => {
      const noFear = observer.calculateConfidence('ally', {
        fear: 0.1,
        resentment: 0.1,
        trust: 0.8,
        respect: 0.8,
        affection: 0.5,
        debt: 0.0,
      });

      const withFear = observer.calculateConfidence('ally', {
        fear: 0.4, // Moderate fear
        resentment: 0.1,
        trust: 0.8,
        respect: 0.8,
        affection: 0.5,
        debt: 0.0,
      });

      expect(noFear).toBeGreaterThan(withFear);
    });

    it('should boost ally confidence for multiple paths', () => {
      const singlePath = observer.calculateConfidence('ally', {
        fear: 0.0,
        resentment: 0.0,
        trust: 0.7,
        respect: 0.7,
        affection: 0.3, // Only trust+respect path
        debt: 0.0,
      });

      const multiplePaths = observer.calculateConfidence('ally', {
        fear: 0.0,
        resentment: 0.0,
        trust: 0.7,
        respect: 0.7,
        affection: 0.7, // Both trust+respect AND friendship paths
        debt: 0.7, // Plus debt path
      });

      expect(multiplePaths).toBeGreaterThan(singlePath);
    });

    it('should return confidence in 0-1 range', () => {
      // Test extreme values
      const extremeVillain = observer.calculateConfidence('villain', {
        fear: 1.0,
        resentment: 1.0,
        trust: 0.0,
        respect: 0.0,
        affection: 0.0,
        debt: 0.0,
      });

      const extremeAlly = observer.calculateConfidence('ally', {
        fear: 0.0,
        resentment: 0.0,
        trust: 1.0,
        respect: 1.0,
        affection: 1.0,
        debt: 1.0,
      });

      expect(extremeVillain).toBeGreaterThanOrEqual(0);
      expect(extremeVillain).toBeLessThanOrEqual(1);
      expect(extremeAlly).toBeGreaterThanOrEqual(0);
      expect(extremeAlly).toBeLessThanOrEqual(1);
    });
  });

  describe('custom thresholds', () => {
    it('should respect custom thresholds', () => {
      const customConfig = createMockConfig();
      customConfig.thresholds = {
        villainFear: 0.9, // Very high threshold
        villainResentment: 0.9,
      };

      const customObserver = new EmergenceObserver(customConfig);

      const relationship = createMockRelationship({
        fear: 0.8, // Would pass default but not custom
        resentment: 0.7,
      });
      const entity: Entity = { type: 'npc', id: 'npc_1' };
      const event = createMockEvent();

      const result = customObserver.checkVillainEmergence(relationship, entity, event);

      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle event without target', () => {
      const event = createMockEvent({
        targetType: undefined,
        targetId: undefined,
      });

      (config.relationshipRepo.findByEntity as any).mockReturnValue([]);

      const result = observer.onEventCommitted(event);

      expect(result.opportunities).toHaveLength(0);
      // Should only call once for actor
      expect(config.relationshipRepo.findByEntity).toHaveBeenCalledTimes(1);
    });

    it('should skip non-NPC relationships', () => {
      const playerToCharacterRel = createMockRelationship({
        from: { type: 'player', id: 'player' },
        to: { type: 'character', id: 'party_member_1' },
        fear: 0.9,
        resentment: 0.9,
      });

      (config.relationshipRepo.findByEntity as any).mockReturnValue([playerToCharacterRel]);

      const event = createMockEvent();
      const result = observer.onEventCommitted(event);

      // Should not detect emergence for non-NPC
      expect(result.opportunities).toHaveLength(0);
    });

    it('should work without event emitter', () => {
      const noEmitterConfig = createMockConfig();
      delete noEmitterConfig.eventEmitter;
      const noEmitterObserver = new EmergenceObserver(noEmitterConfig);

      const relationship = createMockRelationship({
        fear: 0.8,
        resentment: 0.7,
      });

      (noEmitterConfig.relationshipRepo.findByEntity as any).mockReturnValue([relationship]);

      // Should not throw
      expect(() => {
        noEmitterObserver.onEventCommitted(createMockEvent());
      }).not.toThrow();
    });
  });
});
