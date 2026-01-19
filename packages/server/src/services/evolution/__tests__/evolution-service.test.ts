import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { EvolutionService } from '../evolution-service.js';
import { TraitRepository } from '../../../db/repositories/trait-repository.js';
import { RelationshipRepository } from '../../../db/repositories/relationship-repository.js';
import { PendingEvolutionRepository } from '../../../db/repositories/pending-evolution-repository.js';
import type { EvolutionEvent } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('EvolutionService', () => {
  let db: Database.Database;
  let traitRepo: TraitRepository;
  let relationshipRepo: RelationshipRepository;
  let pendingRepo: PendingEvolutionRepository;
  let service: EvolutionService;
  let emittedEvents: EvolutionEvent[];

  function createEvent(id: string, turn: number): { id: string; turn: number; gameId: string } {
    db.exec(`
      INSERT INTO events (id, game_id, turn, event_type, content, location_id, witnesses)
      VALUES ('${id}', 'game-1', ${turn}, 'party_action', 'Test event content', 'area-1', '[]')
    `);
    return { id, turn, gameId: 'game-1' };
  }

  beforeEach(() => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../../../db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a test game
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id, turn)
      VALUES ('game-1', 'player-1', 'area-1', 5)
    `);

    traitRepo = new TraitRepository(db);
    relationshipRepo = new RelationshipRepository(db);
    pendingRepo = new PendingEvolutionRepository(db);
    emittedEvents = [];

    service = new EvolutionService({
      traitRepo,
      relationshipRepo,
      pendingRepo,
      eventEmitter: {
        emit: (event) => emittedEvents.push(event),
      },
    });
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('detectEvolutions', () => {
    it('should process AI suggestions for trait_add', () => {
      const event = createEvent('event-1', 1);

      const aiSuggestions = [
        {
          evolutionType: 'trait_add' as const,
          entityType: 'player' as const,
          entityId: 'player-1',
          trait: 'merciful',
          reason: 'The player showed great mercy by sparing the enemy.',
        },
      ];

      const evolutions = service.detectEvolutions('game-1', event, aiSuggestions);

      expect(evolutions).toHaveLength(1);
      expect(evolutions[0].trait).toBe('merciful');
      expect(evolutions[0].evolutionType).toBe('trait_add');
      expect(evolutions[0].status).toBe('pending');
    });

    it('should process multiple AI suggestions', () => {
      const event = createEvent('event-1', 1);

      const aiSuggestions = [
        {
          evolutionType: 'trait_add' as const,
          entityType: 'player' as const,
          entityId: 'player-1',
          trait: 'merciful',
          reason: 'Showed mercy',
        },
        {
          evolutionType: 'trait_add' as const,
          entityType: 'player' as const,
          entityId: 'player-1',
          trait: 'brave',
          reason: 'Was brave in combat',
        },
      ];

      const evolutions = service.detectEvolutions('game-1', event, aiSuggestions);

      expect(evolutions).toHaveLength(2);
      expect(evolutions.map(e => e.trait)).toContain('merciful');
      expect(evolutions.map(e => e.trait)).toContain('brave');
    });

    it('should process relationship_change suggestions', () => {
      const event = createEvent('event-1', 1);

      const aiSuggestions = [
        {
          evolutionType: 'relationship_change' as const,
          entityType: 'npc' as const,
          entityId: 'witness-1',
          targetType: 'player' as const,
          targetId: 'player-1',
          dimension: 'trust' as const,
          change: 0.2,
          reason: 'The player helped save everyone from the fire.',
        },
      ];

      const evolutions = service.detectEvolutions('game-1', event, aiSuggestions);

      expect(evolutions).toHaveLength(1);
      expect(evolutions[0].evolutionType).toBe('relationship_change');
      expect(evolutions[0].dimension).toBe('trust');
      expect(evolutions[0].oldValue).toBe(0.5); // default
      expect(evolutions[0].newValue).toBe(0.7); // 0.5 + 0.2
    });

    it('should return empty array when no suggestions provided', () => {
      const event = createEvent('event-1', 1);

      const evolutions = service.detectEvolutions('game-1', event);

      expect(evolutions).toHaveLength(0);
    });

    it('should emit evolution:created event', () => {
      const event = createEvent('event-1', 1);

      service.detectEvolutions('game-1', event, [
        {
          evolutionType: 'trait_add' as const,
          entityType: 'player' as const,
          entityId: 'player-1',
          trait: 'brave',
          reason: 'AI detected bravery in action',
        },
      ]);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].type).toBe('evolution:created');
    });
  });

  describe('approve', () => {
    it('should apply trait_add evolution', () => {
      const event = createEvent('event-1', 1);

      const evolutions = service.detectEvolutions('game-1', event, [
        {
          evolutionType: 'trait_add' as const,
          entityType: 'player' as const,
          entityId: 'player-1',
          trait: 'merciful',
          reason: 'The player showed mercy.',
        },
      ]);

      service.approve(evolutions[0].id, 'Looks good!');

      // Verify trait was added
      const traits = traitRepo.findByEntity('game-1', 'player', 'player-1');
      const mercifulTrait = traits.find(t => t.trait === 'merciful');
      expect(mercifulTrait).toBeDefined();

      // Verify status was updated
      const resolved = pendingRepo.findById(evolutions[0].id);
      expect(resolved?.status).toBe('approved');
      expect(resolved?.dmNotes).toBe('Looks good!');
    });

    it('should apply relationship_change evolution', () => {
      const event = createEvent('event-1', 1);

      const evolutions = service.detectEvolutions('game-1', event, [
        {
          evolutionType: 'relationship_change' as const,
          entityType: 'npc' as const,
          entityId: 'merchant-1',
          targetType: 'player' as const,
          targetId: 'player-1',
          dimension: 'trust' as const,
          change: 0.2,
          reason: 'The player helped the merchant.',
        },
      ]);

      service.approve(evolutions[0].id);

      // Verify relationship was updated
      const relationships = relationshipRepo.findByEntity('game-1', { type: 'npc', id: 'merchant-1' });
      expect(relationships.length).toBeGreaterThan(0);
      expect(relationships[0].trust).toBe(0.7); // 0.5 default + 0.2
    });

    it('should emit evolution:approved event', () => {
      const event = createEvent('event-1', 1);

      const evolutions = service.detectEvolutions('game-1', event, [
        {
          evolutionType: 'trait_add' as const,
          entityType: 'player' as const,
          entityId: 'player-1',
          trait: 'merciful',
          reason: 'Test',
        },
      ]);

      emittedEvents = []; // Clear creation events
      service.approve(evolutions[0].id);

      expect(emittedEvents.filter(e => e.type === 'evolution:approved')).toHaveLength(1);
    });
  });

  describe('refuse', () => {
    it('should refuse evolution with notes', () => {
      const event = createEvent('event-1', 1);

      const evolutions = service.detectEvolutions('game-1', event, [
        {
          evolutionType: 'trait_add' as const,
          entityType: 'player' as const,
          entityId: 'player-1',
          trait: 'merciful',
          reason: 'The player showed mercy.',
        },
      ]);

      service.refuse(evolutions[0].id, 'Not convincing enough');

      const resolved = pendingRepo.findById(evolutions[0].id);
      expect(resolved?.status).toBe('refused');
      expect(resolved?.dmNotes).toBe('Not convincing enough');

      // Verify trait was NOT added
      const traits = traitRepo.findByEntity('game-1', 'player', 'player-1');
      const mercifulTrait = traits.find(t => t.trait === 'merciful');
      expect(mercifulTrait).toBeUndefined();
    });

    it('should emit evolution:refused event', () => {
      const event = createEvent('event-1', 1);

      const evolutions = service.detectEvolutions('game-1', event, [
        {
          evolutionType: 'trait_add' as const,
          entityType: 'player' as const,
          entityId: 'player-1',
          trait: 'merciful',
          reason: 'Test',
        },
      ]);

      emittedEvents = []; // Clear creation events
      service.refuse(evolutions[0].id, 'No');

      expect(emittedEvents.filter(e => e.type === 'evolution:refused')).toHaveLength(1);
    });
  });

  describe('edit', () => {
    it('should edit and approve evolution', () => {
      const event = createEvent('event-1', 1);

      const evolutions = service.detectEvolutions('game-1', event, [
        {
          evolutionType: 'trait_add' as const,
          entityType: 'player' as const,
          entityId: 'player-1',
          trait: 'merciful',
          reason: 'The player showed mercy.',
        },
      ]);

      service.edit(evolutions[0].id, { reason: 'Updated reason by DM' });

      const resolved = pendingRepo.findById(evolutions[0].id);
      expect(resolved?.status).toBe('edited');
      expect(resolved?.reason).toBe('Updated reason by DM');
    });

    it('should emit evolution:edited event', () => {
      const event = createEvent('event-1', 1);

      const evolutions = service.detectEvolutions('game-1', event, [
        {
          evolutionType: 'trait_add' as const,
          entityType: 'player' as const,
          entityId: 'player-1',
          trait: 'merciful',
          reason: 'Test',
        },
      ]);

      emittedEvents = []; // Clear creation events
      service.edit(evolutions[0].id, { reason: 'New reason' });

      expect(emittedEvents.filter(e => e.type === 'evolution:edited')).toHaveLength(1);
    });
  });

  describe('computeAggregateLabel', () => {
    it('should compute devoted for high trust + affection + respect', () => {
      const label = service.computeAggregateLabel({
        trust: 0.8,
        respect: 0.7,
        affection: 0.8,
        fear: 0.1,
        resentment: 0.0,
        debt: 0.0,
      });
      expect(label).toBe('devoted');
    });

    it('should compute rival for high respect + resentment', () => {
      const label = service.computeAggregateLabel({
        trust: 0.3,
        respect: 0.7,
        affection: 0.2,
        fear: 0.1,
        resentment: 0.6,
        debt: 0.0,
      });
      expect(label).toBe('rival');
    });

    it('should compute enemy for high fear + resentment', () => {
      // Note: "enemy" requires fear > 0.5 AND resentment > 0.6
      const label = service.computeAggregateLabel({
        trust: 0.1,
        respect: 0.2,
        affection: 0.1,
        fear: 0.6,  // Must be > 0.5 for "enemy"
        resentment: 0.8,
        debt: 0.0,
      });
      expect(label).toBe('enemy');
    });

    it('should compute resentful for high resentment without high fear', () => {
      // When resentment is high but fear is low, it's "resentful" not "enemy"
      const label = service.computeAggregateLabel({
        trust: 0.1,
        respect: 0.2,
        affection: 0.1,
        fear: 0.3,  // Low fear
        resentment: 0.8,
        debt: 0.0,
      });
      expect(label).toBe('resentful');
    });

    it('should compute indifferent for neutral values', () => {
      const label = service.computeAggregateLabel({
        trust: 0.5,
        respect: 0.5,
        affection: 0.5,
        fear: 0.0,
        resentment: 0.0,
        debt: 0.0,
      });
      expect(label).toBe('indifferent');
    });

    it('should compute terrified for very high fear + resentment', () => {
      const label = service.computeAggregateLabel({
        trust: 0.1,
        respect: 0.2,
        affection: 0.1,
        fear: 0.8,  // Very high fear (> 0.7)
        resentment: 0.6,
        debt: 0.0,
      });
      expect(label).toBe('terrified');
    });

    it('should compute ally for high trust + respect', () => {
      const label = service.computeAggregateLabel({
        trust: 0.7,
        respect: 0.7,
        affection: 0.4,
        fear: 0.0,
        resentment: 0.0,
        debt: 0.0,
      });
      expect(label).toBe('ally');
    });

    it('should compute friend for high affection + trust', () => {
      const label = service.computeAggregateLabel({
        trust: 0.6,
        respect: 0.4,
        affection: 0.7,
        fear: 0.0,
        resentment: 0.0,
        debt: 0.0,
      });
      expect(label).toBe('friend');
    });

    it('should compute indebted for high debt', () => {
      const label = service.computeAggregateLabel({
        trust: 0.5,
        respect: 0.5,
        affection: 0.5,
        fear: 0.0,
        resentment: 0.0,
        debt: 0.7,
      });
      expect(label).toBe('indebted');
    });

    it('should compute wary for low trust', () => {
      const label = service.computeAggregateLabel({
        trust: 0.2,
        respect: 0.5,
        affection: 0.3,
        fear: 0.2,
        resentment: 0.2,
        debt: 0.0,
      });
      expect(label).toBe('wary');
    });
  });

  describe('getPendingEvolutions', () => {
    it('should return all pending evolutions', () => {
      const event = createEvent('event-1', 1);

      service.detectEvolutions('game-1', event, [
        {
          evolutionType: 'trait_add' as const,
          entityType: 'player' as const,
          entityId: 'player-1',
          trait: 'merciful',
          reason: 'Showed mercy',
        },
        {
          evolutionType: 'trait_add' as const,
          entityType: 'player' as const,
          entityId: 'player-1',
          trait: 'brave',
          reason: 'Was brave',
        },
      ]);

      const pending = service.getPendingEvolutions('game-1');
      expect(pending.length).toBe(2);
      expect(pending.every(p => p.status === 'pending')).toBe(true);
    });

    it('should exclude resolved evolutions when pendingOnly is true', () => {
      const event = createEvent('event-1', 1);

      const evolutions = service.detectEvolutions('game-1', event, [
        {
          evolutionType: 'trait_add' as const,
          entityType: 'player' as const,
          entityId: 'player-1',
          trait: 'merciful',
          reason: 'Showed mercy',
        },
        {
          evolutionType: 'trait_add' as const,
          entityType: 'player' as const,
          entityId: 'player-1',
          trait: 'brave',
          reason: 'Was brave',
        },
      ]);

      service.approve(evolutions[0].id);

      const pending = service.getPendingEvolutions('game-1', true);
      expect(pending.length).toBe(1);
      expect(pending[0].trait).toBe('brave');
    });

    it('should include resolved evolutions when pendingOnly is false', () => {
      const event = createEvent('event-1', 1);

      const evolutions = service.detectEvolutions('game-1', event, [
        {
          evolutionType: 'trait_add' as const,
          entityType: 'player' as const,
          entityId: 'player-1',
          trait: 'merciful',
          reason: 'Showed mercy',
        },
      ]);

      service.approve(evolutions[0].id);

      const all = service.getPendingEvolutions('game-1', false);
      expect(all.length).toBe(1);
      expect(all[0].status).toBe('approved');
    });
  });

  describe('getEntitySummary', () => {
    it('should return entity traits and relationships', () => {
      // Add traits directly through repo
      traitRepo.addTrait({
        gameId: 'game-1',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'honorable',
        turn: 1,
      });
      traitRepo.addTrait({
        gameId: 'game-1',
        entityType: 'player',
        entityId: 'player-1',
        trait: 'merciful',
        turn: 2,
      });

      // Add a relationship
      relationshipRepo.upsert({
        gameId: 'game-1',
        from: { type: 'player', id: 'player-1' },
        to: { type: 'npc', id: 'guard' },
        updatedTurn: 1,
        trust: 0.8,
        respect: 0.7,
        affection: 0.6,
      });

      const summary = service.getEntitySummary('game-1', 'player', 'player-1');

      expect(summary.traits).toContain('honorable');
      expect(summary.traits).toContain('merciful');
      expect(summary.relationships).toHaveLength(1);
      expect(summary.relationships[0].targetType).toBe('npc');
      expect(summary.relationships[0].targetId).toBe('guard');
    });
  });
});
