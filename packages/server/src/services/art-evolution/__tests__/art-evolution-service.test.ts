import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ArtEvolutionService,
  type ArtEvolutionServiceConfig,
} from '../art-evolution-service.js';
import type {
  ArtEvolutionTriggerContext,
  ArtEvolutionRequest,
  ArtEvolutionEvent,
  ArtEvolutionEventEmitter,
  ActTransitionData,
  StatusEffectData,
  MajorEventData,
  EquipmentChangeData,
} from '../types.js';

describe('ArtEvolutionService', () => {
  let service: ArtEvolutionService;
  let emittedEvents: ArtEvolutionEvent[];
  let mockEmitter: ArtEvolutionEventEmitter;

  const sampleSource = `{"type":"palette","name":"colors","colors":{"{skin}":"#FFE0BD","{eyes}":"#3366CC"}}
{"type":"sprite","name":"hero","palette":{"{skin}":"#FFE0BD","{eyes}":"#3366CC"},"grid":["..."]}`;

  beforeEach(() => {
    emittedEvents = [];
    mockEmitter = {
      emit: (event: ArtEvolutionEvent) => {
        emittedEvents.push(event);
      },
    };

    service = new ArtEvolutionService({
      eventEmitter: mockEmitter,
    });
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const defaultService = new ArtEvolutionService();
      expect(defaultService).toBeDefined();
    });

    it('should merge custom trait mappings', () => {
      const customService = new ArtEvolutionService({
        customTraitMappings: [
          {
            trait: 'custom_trait',
            strategy: 'variant',
            params: {
              paletteModifications: [{ originalKey: 'test', newColor: '#FF0000' }],
            },
          },
        ],
      });

      const mapping = customService.getTraitMapping('custom_trait');
      expect(mapping).toBeDefined();
      expect(mapping?.strategy).toBe('variant');
    });
  });

  describe('processTrigger', () => {
    describe('act_transition', () => {
      it('should return regenerate request for act increase', () => {
        const context: ArtEvolutionTriggerContext = {
          trigger: 'act_transition',
          gameId: 'game-1',
          turn: 50,
          entityType: 'character',
          entityId: 'hero-1',
          data: {
            type: 'act_transition',
            fromAct: 1,
            toAct: 2,
          } as ActTransitionData,
        };

        const request = service.processTrigger(context);

        expect(request).not.toBeNull();
        expect(request?.strategy).toBe('regenerate');
        expect(request?.params?.promptHints).toContain(
          'Character has progressed from Act 1 to Act 2'
        );
      });

      it('should return null for no act change', () => {
        const context: ArtEvolutionTriggerContext = {
          trigger: 'act_transition',
          gameId: 'game-1',
          turn: 50,
          entityType: 'character',
          entityId: 'hero-1',
          data: {
            type: 'act_transition',
            fromAct: 1,
            toAct: 1,
          } as ActTransitionData,
        };

        const request = service.processTrigger(context);
        expect(request).toBeNull();
      });
    });

    describe('status_effect', () => {
      it('should return request for mapped trait', () => {
        const context: ArtEvolutionTriggerContext = {
          trigger: 'status_effect',
          gameId: 'game-1',
          turn: 10,
          entityType: 'character',
          entityId: 'hero-1',
          data: {
            type: 'status_effect',
            trait: 'haunted',
            action: 'added',
          } as StatusEffectData,
        };

        const request = service.processTrigger(context);

        expect(request).not.toBeNull();
        expect(request?.strategy).toBe('variant');
        expect(request?.params?.paletteModifications).toBeDefined();
      });

      it('should return null for unmapped trait', () => {
        const context: ArtEvolutionTriggerContext = {
          trigger: 'status_effect',
          gameId: 'game-1',
          turn: 10,
          entityType: 'character',
          entityId: 'hero-1',
          data: {
            type: 'status_effect',
            trait: 'unknown_trait',
            action: 'added',
          } as StatusEffectData,
        };

        const request = service.processTrigger(context);
        expect(request).toBeNull();
      });

      it('should return null for removed trait', () => {
        const context: ArtEvolutionTriggerContext = {
          trigger: 'status_effect',
          gameId: 'game-1',
          turn: 10,
          entityType: 'character',
          entityId: 'hero-1',
          data: {
            type: 'status_effect',
            trait: 'haunted',
            action: 'removed',
          } as StatusEffectData,
        };

        const request = service.processTrigger(context);
        expect(request).toBeNull();
      });
    });

    describe('major_event', () => {
      it('should return request based on event type', () => {
        const context: ArtEvolutionTriggerContext = {
          trigger: 'major_event',
          gameId: 'game-1',
          turn: 20,
          entityType: 'character',
          entityId: 'hero-1',
          data: {
            type: 'major_event',
            eventId: 'event-1',
            eventType: 'party_action',
            description: 'Hero defeats the dragon',
          } as MajorEventData,
        };

        const request = service.processTrigger(context);

        expect(request).not.toBeNull();
        expect(request?.strategy).toBe('composition');
      });
    });

    describe('equipment_change', () => {
      it('should return composition request for equipment', () => {
        const context: ArtEvolutionTriggerContext = {
          trigger: 'equipment_change',
          gameId: 'game-1',
          turn: 15,
          entityType: 'character',
          entityId: 'hero-1',
          data: {
            type: 'equipment_change',
            slot: 'weapon',
            previousItem: 'iron_sword',
            newItem: 'flaming_sword',
          } as EquipmentChangeData,
        };

        const request = service.processTrigger(context);

        expect(request).not.toBeNull();
        expect(request?.strategy).toBe('composition');
        expect(request?.params?.layers).toBeDefined();
        expect(request?.params?.layers?.[0].spriteName).toBe('equipment_weapon_flaming_sword');
      });
    });
  });

  describe('evolve', () => {
    describe('variant strategy', () => {
      it('should modify palette colors', async () => {
        const request: ArtEvolutionRequest = {
          triggerContext: {
            trigger: 'status_effect',
            gameId: 'game-1',
            turn: 10,
            entityType: 'character',
            entityId: 'hero-1',
            data: { type: 'status_effect', trait: 'haunted', action: 'added' },
          },
          strategy: 'variant',
          currentSource: sampleSource,
          currentSpriteName: 'hero',
          params: {
            paletteModifications: [
              { originalKey: '{skin}', newColor: '#CCCCCC' },
            ],
          },
        };

        const result = await service.evolve(request);

        expect(result.success).toBe(true);
        expect(result.newSource).toBeDefined();
        expect(result.newSource).toContain('#CCCCCC');
        expect(result.newSpriteName).toContain('hero_variant_');
        expect(result.archiveEntry).toBeDefined();
      });

      it('should fail without palette modifications', async () => {
        const request: ArtEvolutionRequest = {
          triggerContext: {
            trigger: 'status_effect',
            gameId: 'game-1',
            turn: 10,
            entityType: 'character',
            entityId: 'hero-1',
            data: { type: 'status_effect', trait: 'haunted', action: 'added' },
          },
          strategy: 'variant',
          currentSource: sampleSource,
          currentSpriteName: 'hero',
          params: {},
        };

        const result = await service.evolve(request);

        expect(result.success).toBe(false);
        expect(result.error).toContain('No palette modifications');
      });
    });

    describe('composition strategy', () => {
      it('should add composition layer', async () => {
        const request: ArtEvolutionRequest = {
          triggerContext: {
            trigger: 'equipment_change',
            gameId: 'game-1',
            turn: 15,
            entityType: 'character',
            entityId: 'hero-1',
            data: { type: 'equipment_change', slot: 'weapon', newItem: 'sword' },
          },
          strategy: 'composition',
          currentSource: sampleSource,
          currentSpriteName: 'hero',
          params: {
            layers: [
              { spriteName: 'sword_overlay', zIndex: 1, opacity: 1.0 },
            ],
          },
        };

        const result = await service.evolve(request);

        expect(result.success).toBe(true);
        expect(result.newSource).toContain('"type":"composition"');
        expect(result.newSource).toContain('sword_overlay');
        expect(result.newSpriteName).toContain('hero_composed_');
      });

      it('should fail without layers', async () => {
        const request: ArtEvolutionRequest = {
          triggerContext: {
            trigger: 'equipment_change',
            gameId: 'game-1',
            turn: 15,
            entityType: 'character',
            entityId: 'hero-1',
            data: { type: 'equipment_change', slot: 'weapon', newItem: 'sword' },
          },
          strategy: 'composition',
          currentSource: sampleSource,
          currentSpriteName: 'hero',
          params: {},
        };

        const result = await service.evolve(request);

        expect(result.success).toBe(false);
        expect(result.error).toContain('No layers specified');
      });
    });

    describe('regenerate strategy', () => {
      it('should create regeneration marker', async () => {
        const request: ArtEvolutionRequest = {
          triggerContext: {
            trigger: 'act_transition',
            gameId: 'game-1',
            turn: 50,
            entityType: 'character',
            entityId: 'hero-1',
            data: { type: 'act_transition', fromAct: 1, toAct: 2 },
          },
          strategy: 'regenerate',
          currentSource: sampleSource,
          currentSpriteName: 'hero',
          params: {
            promptHints: ['Show battle scars', 'More weathered appearance'],
          },
        };

        const result = await service.evolve(request);

        expect(result.success).toBe(true);
        expect(result.newSource).toContain('"type":"regeneration_pending"');
        expect(result.newSource).toContain('Show battle scars');
        expect(result.newSpriteName).toContain('hero_regenerated_');
      });
    });

    it('should emit events during evolution', async () => {
      const request: ArtEvolutionRequest = {
        triggerContext: {
          trigger: 'status_effect',
          gameId: 'game-1',
          turn: 10,
          entityType: 'character',
          entityId: 'hero-1',
          data: { type: 'status_effect', trait: 'haunted', action: 'added' },
        },
        strategy: 'variant',
        currentSource: sampleSource,
        currentSpriteName: 'hero',
        params: {
          paletteModifications: [{ originalKey: '{skin}', newColor: '#CCCCCC' }],
        },
      };

      await service.evolve(request);

      expect(emittedEvents).toContainEqual(
        expect.objectContaining({ type: 'art:evolution_started' })
      );
      expect(emittedEvents).toContainEqual(
        expect.objectContaining({ type: 'art:archived' })
      );
      expect(emittedEvents).toContainEqual(
        expect.objectContaining({ type: 'art:evolution_completed' })
      );
    });
  });

  describe('archive', () => {
    it('should create archive entries', () => {
      const entry = service.archiveArt(
        'game-1',
        'character',
        'hero-1',
        sampleSource,
        'hero',
        10
      );

      expect(entry.id).toBeDefined();
      expect(entry.gameId).toBe('game-1');
      expect(entry.entityType).toBe('character');
      expect(entry.entityId).toBe('hero-1');
      expect(entry.source).toBe(sampleSource);
      expect(entry.spriteName).toBe('hero');
      expect(entry.fromTurn).toBe(10);
      expect(entry.toTurn).toBeUndefined();
    });

    it('should close previous entry when archiving new one', () => {
      const entry1 = service.archiveArt(
        'game-1',
        'character',
        'hero-1',
        sampleSource,
        'hero_v1',
        10
      );

      const entry2 = service.archiveArt(
        'game-1',
        'character',
        'hero-1',
        sampleSource + '\n{"modified":true}',
        'hero_v2',
        20,
        'status_effect'
      );

      // Retrieve the first entry and check it's closed
      const updatedEntry1 = service.getArchiveEntry(entry1.id);
      expect(updatedEntry1?.toTurn).toBe(20);
      expect(updatedEntry1?.trigger).toBe('status_effect');

      // Second entry should be open
      expect(entry2.toTurn).toBeUndefined();
    });
  });

  describe('getHistory', () => {
    it('should return full history for entity', async () => {
      // Create some history
      service.archiveArt('game-1', 'character', 'hero-1', 'source1', 'hero_v1', 1);
      service.archiveArt('game-1', 'character', 'hero-1', 'source2', 'hero_v2', 10, 'act_transition');
      service.archiveArt('game-1', 'character', 'hero-1', 'source3', 'hero_v3', 20, 'status_effect');

      const history = service.getHistory('game-1', 'character', 'hero-1');

      expect(history.entityType).toBe('character');
      expect(history.entityId).toBe('hero-1');
      expect(history.current).toBeDefined();
      expect(history.current?.spriteName).toBe('hero_v3');
      expect(history.history).toHaveLength(2);
      expect(history.history[0].spriteName).toBe('hero_v2'); // Newest closed first
    });

    it('should return empty history for unknown entity', () => {
      const history = service.getHistory('game-1', 'character', 'unknown');

      expect(history.current).toBeNull();
      expect(history.history).toHaveLength(0);
    });
  });

  describe('getTraitMapping', () => {
    it('should return mapping for known trait', () => {
      const mapping = service.getTraitMapping('haunted');

      expect(mapping).toBeDefined();
      expect(mapping?.strategy).toBe('variant');
    });

    it('should return undefined for unknown trait', () => {
      const mapping = service.getTraitMapping('unknown_trait');
      expect(mapping).toBeUndefined();
    });
  });
});
