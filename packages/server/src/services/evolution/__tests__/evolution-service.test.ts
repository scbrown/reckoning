import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { CanonicalEvent } from '@reckoning/shared/game';
import { EvolutionService } from '../evolution-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

describe('EvolutionService', () => {
  let db: Database.Database;
  let service: EvolutionService;

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

    service = new EvolutionService(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('detectSystemEvolutions', () => {
    it('should detect trait from single event', async () => {
      const event = createEvent({
        content: 'The player showed great mercy by sparing the enemy.',
      });

      // Insert the event into the database
      db.exec(`
        INSERT INTO events (id, game_id, turn, event_type, content, location_id, witnesses)
        VALUES ('event-1', 'game-1', 1, 'party_action', 'The player showed great mercy by sparing the enemy.', 'area-1', '[]')
      `);

      const evolutions = await service.detectSystemEvolutions(
        'game-1',
        event,
        'player',
        'player-1'
      );

      const mercifulEvolution = evolutions.find(e => e.trait === 'merciful');
      expect(mercifulEvolution).toBeDefined();
      expect(mercifulEvolution!.evolutionType).toBe('trait_add');
      expect(mercifulEvolution!.status).toBe('pending');
    });

    it('should not duplicate pending evolutions', async () => {
      const event1 = createEvent({
        id: 'event-1',
        turn: 1,
        content: 'The player showed mercy.',
      });

      db.exec(`
        INSERT INTO events (id, game_id, turn, event_type, content, location_id, witnesses)
        VALUES ('event-1', 'game-1', 1, 'party_action', 'The player showed mercy.', 'area-1', '[]')
      `);

      // First detection
      await service.detectSystemEvolutions('game-1', event1, 'player', 'player-1');

      const event2 = createEvent({
        id: 'event-2',
        turn: 2,
        content: 'The player showed mercy again.',
      });

      db.exec(`
        INSERT INTO events (id, game_id, turn, event_type, content, location_id, witnesses)
        VALUES ('event-2', 'game-1', 2, 'party_action', 'The player showed mercy again.', 'area-1', '[]')
      `);

      // Second detection should not create duplicate
      const evolutions = await service.detectSystemEvolutions(
        'game-1',
        event2,
        'player',
        'player-1'
      );

      const mercifulEvolutions = evolutions.filter(e => e.trait === 'merciful');
      expect(mercifulEvolutions).toHaveLength(0); // Already pending
    });

    it('should not suggest trait entity already has', async () => {
      // Add merciful trait to player
      db.exec(`
        INSERT INTO entity_traits (id, game_id, entity_type, entity_id, trait, acquired_turn, status, created_at)
        VALUES ('trait-1', 'game-1', 'player', 'player-1', 'merciful', 1, 'active', datetime('now'))
      `);

      const event = createEvent({
        content: 'The player showed mercy once more.',
      });

      db.exec(`
        INSERT INTO events (id, game_id, turn, event_type, content, location_id, witnesses)
        VALUES ('event-1', 'game-1', 5, 'party_action', 'The player showed mercy once more.', 'area-1', '[]')
      `);

      const evolutions = await service.detectSystemEvolutions(
        'game-1',
        event,
        'player',
        'player-1'
      );

      const mercifulEvolution = evolutions.find(e => e.trait === 'merciful');
      expect(mercifulEvolution).toBeUndefined();
    });

    it('should detect relationship changes from witnesses', async () => {
      const event = createEvent({
        content: 'The player helped save everyone from the fire.',
        witnesses: ['witness-1'],
      });

      db.exec(`
        INSERT INTO events (id, game_id, turn, event_type, content, location_id, witnesses)
        VALUES ('event-1', 'game-1', 1, 'party_action', 'The player helped save everyone from the fire.', 'area-1', '["witness-1"]')
      `);

      const evolutions = await service.detectSystemEvolutions(
        'game-1',
        event,
        'player',
        'player-1'
      );

      const relationshipEvolution = evolutions.find(
        e => e.evolutionType === 'relationship_change'
      );
      expect(relationshipEvolution).toBeDefined();
    });
  });

  describe('detectEvolutions with AI suggestions', () => {
    it('should process AI suggestions', async () => {
      const event = createEvent({
        content: 'Something happened.',
      });

      db.exec(`
        INSERT INTO events (id, game_id, turn, event_type, content, location_id, witnesses)
        VALUES ('event-1', 'game-1', 1, 'party_action', 'Something happened.', 'area-1', '[]')
      `);

      const aiSuggestions = [
        {
          evolutionType: 'trait_add' as const,
          entityType: 'player' as const,
          entityId: 'player-1',
          trait: 'brave',
          reason: 'AI detected bravery in action',
        },
      ];

      const evolutions = await service.detectEvolutions(
        'game-1',
        event,
        'player',
        'player-1',
        aiSuggestions
      );

      const braveEvolution = evolutions.find(e => e.trait === 'brave');
      expect(braveEvolution).toBeDefined();
      expect(braveEvolution!.reason).toBe('AI detected bravery in action');
    });

    it('should skip AI trait suggestion if entity already has trait', async () => {
      db.exec(`
        INSERT INTO entity_traits (id, game_id, entity_type, entity_id, trait, acquired_turn, status, created_at)
        VALUES ('trait-1', 'game-1', 'player', 'player-1', 'brave', 1, 'active', datetime('now'))
      `);

      const event = createEvent({ content: 'Something happened.' });

      db.exec(`
        INSERT INTO events (id, game_id, turn, event_type, content, location_id, witnesses)
        VALUES ('event-1', 'game-1', 1, 'party_action', 'Something happened.', 'area-1', '[]')
      `);

      const aiSuggestions = [
        {
          evolutionType: 'trait_add' as const,
          entityType: 'player' as const,
          entityId: 'player-1',
          trait: 'brave',
          reason: 'AI detected bravery',
        },
      ];

      const evolutions = await service.detectEvolutions(
        'game-1',
        event,
        'player',
        'player-1',
        aiSuggestions
      );

      const braveEvolution = evolutions.find(e => e.trait === 'brave');
      expect(braveEvolution).toBeUndefined();
    });
  });

  describe('approve', () => {
    it('should apply trait_add evolution', async () => {
      const event = createEvent({
        content: 'The player showed mercy.',
      });

      db.exec(`
        INSERT INTO events (id, game_id, turn, event_type, content, location_id, witnesses)
        VALUES ('event-1', 'game-1', 1, 'party_action', 'The player showed mercy.', 'area-1', '[]')
      `);

      const evolutions = await service.detectSystemEvolutions(
        'game-1',
        event,
        'player',
        'player-1'
      );

      const mercifulEvolution = evolutions.find(e => e.trait === 'merciful');
      expect(mercifulEvolution).toBeDefined();

      const approved = service.approve(mercifulEvolution!.id, 'Looks good!');
      expect(approved).not.toBeNull();
      expect(approved!.status).toBe('approved');

      // Verify trait was added
      const traits = service.getTraits('game-1', 'player', 'player-1');
      const mercifulTrait = traits.find(t => t.trait === 'merciful');
      expect(mercifulTrait).toBeDefined();
    });

    it('should apply relationship_change evolution', async () => {
      const event = createEvent({
        content: 'The player helped the merchant.',
        witnesses: ['merchant-1'],
      });

      db.exec(`
        INSERT INTO events (id, game_id, turn, event_type, content, location_id, witnesses)
        VALUES ('event-1', 'game-1', 1, 'party_action', 'The player helped the merchant.', 'area-1', '["merchant-1"]')
      `);

      const evolutions = await service.detectSystemEvolutions(
        'game-1',
        event,
        'player',
        'player-1'
      );

      const relEvolution = evolutions.find(e => e.evolutionType === 'relationship_change');
      if (relEvolution) {
        const approved = service.approve(relEvolution.id);
        expect(approved).not.toBeNull();
        expect(approved!.status).toBe('approved');

        // Verify relationship was updated
        const relationships = service.getRelationships('game-1', 'npc', 'merchant-1');
        expect(relationships.length).toBeGreaterThan(0);
      }
    });
  });

  describe('refuse', () => {
    it('should refuse evolution with notes', async () => {
      const event = createEvent({
        content: 'The player showed mercy.',
      });

      db.exec(`
        INSERT INTO events (id, game_id, turn, event_type, content, location_id, witnesses)
        VALUES ('event-1', 'game-1', 1, 'party_action', 'The player showed mercy.', 'area-1', '[]')
      `);

      const evolutions = await service.detectSystemEvolutions(
        'game-1',
        event,
        'player',
        'player-1'
      );

      const mercifulEvolution = evolutions.find(e => e.trait === 'merciful');
      expect(mercifulEvolution).toBeDefined();

      const refused = service.refuse(mercifulEvolution!.id, 'Not convincing enough');
      expect(refused).not.toBeNull();
      expect(refused!.status).toBe('refused');
      expect(refused!.dmNotes).toBe('Not convincing enough');

      // Verify trait was NOT added
      const traits = service.getTraits('game-1', 'player', 'player-1');
      const mercifulTrait = traits.find(t => t.trait === 'merciful');
      expect(mercifulTrait).toBeUndefined();
    });
  });

  describe('edit', () => {
    it('should edit and approve evolution', async () => {
      const event = createEvent({
        content: 'The player showed mercy.',
      });

      db.exec(`
        INSERT INTO events (id, game_id, turn, event_type, content, location_id, witnesses)
        VALUES ('event-1', 'game-1', 1, 'party_action', 'The player showed mercy.', 'area-1', '[]')
      `);

      const evolutions = await service.detectSystemEvolutions(
        'game-1',
        event,
        'player',
        'player-1'
      );

      const evolution = evolutions[0];
      const edited = service.edit(evolution.id, {
        reason: 'Updated reason by DM',
      });

      expect(edited).not.toBeNull();
      expect(edited!.status).toBe('approved');
    });
  });

  describe('computeAggregateLabel', () => {
    it('should compute devoted for high trust + affection + respect', () => {
      const relationship = {
        id: 'rel-1',
        gameId: 'game-1',
        from: { type: 'npc' as const, id: 'npc-1' },
        to: { type: 'player' as const, id: 'player-1' },
        trust: 0.8,
        respect: 0.7,
        affection: 0.8,
        fear: 0.1,
        resentment: 0.0,
        debt: 0.0,
        updatedTurn: 1,
        createdAt: '2026-01-18T00:00:00Z',
        updatedAt: '2026-01-18T00:00:00Z',
      };

      const label = service.computeAggregateLabel(relationship);
      expect(label).toBe('devoted');
    });

    it('should compute rival for high respect + resentment', () => {
      const relationship = {
        id: 'rel-1',
        gameId: 'game-1',
        from: { type: 'npc' as const, id: 'npc-1' },
        to: { type: 'player' as const, id: 'player-1' },
        trust: 0.3,
        respect: 0.7,
        affection: 0.2,
        fear: 0.1,
        resentment: 0.6,
        debt: 0.0,
        updatedTurn: 1,
        createdAt: '2026-01-18T00:00:00Z',
        updatedAt: '2026-01-18T00:00:00Z',
      };

      const label = service.computeAggregateLabel(relationship);
      expect(label).toBe('rival');
    });

    it('should compute enemy for high resentment + low trust', () => {
      const relationship = {
        id: 'rel-1',
        gameId: 'game-1',
        from: { type: 'npc' as const, id: 'npc-1' },
        to: { type: 'player' as const, id: 'player-1' },
        trust: 0.1,
        respect: 0.2,
        affection: 0.1,
        fear: 0.3,
        resentment: 0.8,
        debt: 0.0,
        updatedTurn: 1,
        createdAt: '2026-01-18T00:00:00Z',
        updatedAt: '2026-01-18T00:00:00Z',
      };

      const label = service.computeAggregateLabel(relationship);
      expect(label).toBe('enemy');
    });

    it('should compute indifferent for neutral values', () => {
      const relationship = {
        id: 'rel-1',
        gameId: 'game-1',
        from: { type: 'npc' as const, id: 'npc-1' },
        to: { type: 'player' as const, id: 'player-1' },
        trust: 0.5,
        respect: 0.5,
        affection: 0.5,
        fear: 0.0,
        resentment: 0.0,
        debt: 0.0,
        updatedTurn: 1,
        createdAt: '2026-01-18T00:00:00Z',
        updatedAt: '2026-01-18T00:00:00Z',
      };

      const label = service.computeAggregateLabel(relationship);
      expect(label).toBe('indifferent');
    });
  });

  describe('getPending', () => {
    it('should return all pending evolutions', async () => {
      const event = createEvent({
        content: 'The player showed mercy and was very brave in battle.',
      });

      db.exec(`
        INSERT INTO events (id, game_id, turn, event_type, content, location_id, witnesses)
        VALUES ('event-1', 'game-1', 1, 'party_action', 'The player showed mercy and was very brave in battle.', 'area-1', '[]')
      `);

      await service.detectSystemEvolutions('game-1', event, 'player', 'player-1');

      const pending = service.getPending('game-1');
      expect(pending.length).toBeGreaterThan(0);
      expect(pending.every(p => p.status === 'pending')).toBe(true);
    });
  });
});
