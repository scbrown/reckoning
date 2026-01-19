import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { EventRepository } from '../../../db/repositories/event-repository.js';
import { PatternObserver } from '../pattern-observer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PatternObserver', () => {
  let db: Database.Database;
  let eventRepo: EventRepository;
  let observer: PatternObserver;

  beforeEach(() => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../../../db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create a test game
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id, turn)
      VALUES ('game-1', 'player-1', 'area-1', 10)
    `);

    eventRepo = new EventRepository(db);
    observer = new PatternObserver(eventRepo);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('getPlayerPatterns', () => {
    it('should return patterns with category counts', () => {
      // Create events with different action categories
      eventRepo.create({
        gameId: 'game-1',
        turn: 1,
        eventType: 'party_action',
        content: 'Spared the goblin',
        locationId: 'area-1',
        witnesses: [],
        action: 'spare_enemy',
        actorType: 'player',
        actorId: 'player-1',
      });

      eventRepo.create({
        gameId: 'game-1',
        turn: 2,
        eventType: 'party_action',
        content: 'Killed the bandit',
        locationId: 'area-1',
        witnesses: [],
        action: 'kill',
        actorType: 'player',
        actorId: 'player-1',
      });

      eventRepo.create({
        gameId: 'game-1',
        turn: 3,
        eventType: 'party_action',
        content: 'Helped the villager',
        locationId: 'area-1',
        witnesses: [],
        action: 'help',
        actorType: 'player',
        actorId: 'player-1',
      });

      const patterns = observer.getPlayerPatterns('game-1', 'player-1');

      expect(patterns.playerId).toBe('player-1');
      expect(patterns.gameId).toBe('game-1');
      expect(patterns.totalEvents).toBe(3);
      expect(patterns.categoryCounts.mercy).toBe(1);
      expect(patterns.categoryCounts.violence).toBe(1);
      expect(patterns.categoryCounts.social).toBe(1);
    });

    it('should return empty patterns for player with no events', () => {
      const patterns = observer.getPlayerPatterns('game-1', 'player-none');

      expect(patterns.totalEvents).toBe(0);
      expect(patterns.categoryCounts.mercy).toBe(0);
      expect(patterns.categoryCounts.violence).toBe(0);
    });

    it('should filter by turn range when specified', () => {
      eventRepo.create({
        gameId: 'game-1',
        turn: 1,
        eventType: 'party_action',
        content: 'Early action',
        locationId: 'area-1',
        witnesses: [],
        action: 'kill',
        actorType: 'player',
        actorId: 'player-1',
      });

      eventRepo.create({
        gameId: 'game-1',
        turn: 5,
        eventType: 'party_action',
        content: 'Middle action',
        locationId: 'area-1',
        witnesses: [],
        action: 'help',
        actorType: 'player',
        actorId: 'player-1',
      });

      eventRepo.create({
        gameId: 'game-1',
        turn: 10,
        eventType: 'party_action',
        content: 'Late action',
        locationId: 'area-1',
        witnesses: [],
        action: 'spare_enemy',
        actorType: 'player',
        actorId: 'player-1',
      });

      const patterns = observer.getPlayerPatterns('game-1', 'player-1', {
        turnRange: { start: 4, end: 6 },
      });

      expect(patterns.totalEvents).toBe(1);
      expect(patterns.categoryCounts.social).toBe(1);
    });
  });

  describe('calculateRatio', () => {
    it('should calculate mercy vs violence ratio', () => {
      // Create 3 mercy events
      for (let i = 0; i < 3; i++) {
        eventRepo.create({
          gameId: 'game-1',
          turn: i + 1,
          eventType: 'party_action',
          content: `Mercy event ${i}`,
          locationId: 'area-1',
          witnesses: [],
          action: 'spare_enemy',
          actorType: 'player',
          actorId: 'player-1',
        });
      }

      // Create 1 violence event
      eventRepo.create({
        gameId: 'game-1',
        turn: 4,
        eventType: 'party_action',
        content: 'Violence event',
        locationId: 'area-1',
        witnesses: [],
        action: 'kill',
        actorType: 'player',
        actorId: 'player-1',
      });

      const ratio = observer.calculateRatio('game-1', 'player-1', 'mercy', 'violence');

      // (3 - 1) / 4 = 0.5
      expect(ratio).toBe(0.5);
    });

    it('should return null for insufficient data', () => {
      // Only 1 event, below threshold
      eventRepo.create({
        gameId: 'game-1',
        turn: 1,
        eventType: 'party_action',
        content: 'Single event',
        locationId: 'area-1',
        witnesses: [],
        action: 'kill',
        actorType: 'player',
        actorId: 'player-1',
      });

      const ratio = observer.calculateRatio('game-1', 'player-1', 'mercy', 'violence');

      expect(ratio).toBeNull();
    });

    it('should return 1 for all category A', () => {
      for (let i = 0; i < 5; i++) {
        eventRepo.create({
          gameId: 'game-1',
          turn: i + 1,
          eventType: 'party_action',
          content: `Mercy event ${i}`,
          locationId: 'area-1',
          witnesses: [],
          action: 'spare_enemy',
          actorType: 'player',
          actorId: 'player-1',
        });
      }

      const ratio = observer.calculateRatio('game-1', 'player-1', 'mercy', 'violence');

      expect(ratio).toBe(1);
    });

    it('should return -1 for all category B', () => {
      for (let i = 0; i < 5; i++) {
        eventRepo.create({
          gameId: 'game-1',
          turn: i + 1,
          eventType: 'party_action',
          content: `Violence event ${i}`,
          locationId: 'area-1',
          witnesses: [],
          action: 'kill',
          actorType: 'player',
          actorId: 'player-1',
        });
      }

      const ratio = observer.calculateRatio('game-1', 'player-1', 'mercy', 'violence');

      expect(ratio).toBe(-1);
    });
  });

  describe('calculateViolenceInitiation', () => {
    it('should detect player who initiates violence', () => {
      // Create multiple attack_first events
      for (let i = 0; i < 4; i++) {
        eventRepo.create({
          gameId: 'game-1',
          turn: i + 1,
          eventType: 'party_action',
          content: `Attack first ${i}`,
          locationId: 'area-1',
          witnesses: [],
          action: 'attack_first',
          actorType: 'player',
          actorId: 'player-1',
        });
      }

      // Add one regular kill
      eventRepo.create({
        gameId: 'game-1',
        turn: 5,
        eventType: 'party_action',
        content: 'Kill event',
        locationId: 'area-1',
        witnesses: [],
        action: 'kill',
        actorType: 'player',
        actorId: 'player-1',
      });

      const result = observer.calculateViolenceInitiation('game-1', 'player-1');

      expect(result.initiatesViolence).toBe(true);
      expect(result.totalViolenceEvents).toBe(5);
      expect(result.attackFirstEvents).toBe(4);
      expect(result.initiationRatio).toBe(0.8);
    });

    it('should detect player who does not initiate violence', () => {
      // Create only kill events, no attack_first
      for (let i = 0; i < 5; i++) {
        eventRepo.create({
          gameId: 'game-1',
          turn: i + 1,
          eventType: 'party_action',
          content: `Kill event ${i}`,
          locationId: 'area-1',
          witnesses: [],
          action: 'kill',
          actorType: 'player',
          actorId: 'player-1',
        });
      }

      const result = observer.calculateViolenceInitiation('game-1', 'player-1');

      expect(result.initiatesViolence).toBe(false);
      expect(result.totalViolenceEvents).toBe(5);
      expect(result.attackFirstEvents).toBe(0);
      expect(result.initiationRatio).toBe(0);
    });

    it('should return zero values for player with no violence', () => {
      eventRepo.create({
        gameId: 'game-1',
        turn: 1,
        eventType: 'party_action',
        content: 'Peaceful action',
        locationId: 'area-1',
        witnesses: [],
        action: 'help',
        actorType: 'player',
        actorId: 'player-1',
      });

      const result = observer.calculateViolenceInitiation('game-1', 'player-1');

      expect(result.initiatesViolence).toBe(false);
      expect(result.totalViolenceEvents).toBe(0);
      expect(result.initiationRatio).toBe(0);
    });
  });

  describe('classifySocialApproach', () => {
    it('should classify as helpful', () => {
      const events = [
        { action: 'help' },
        { action: 'help' },
        { action: 'help' },
        { action: 'befriend' },
        { action: 'persuade' },
      ].map((e, i) => createMockEvent(i, e.action));

      const approach = observer.classifySocialApproach(events);
      expect(approach).toBe('helpful');
    });

    it('should classify as hostile', () => {
      const events = [
        { action: 'betray' },
        { action: 'insult' },
        { action: 'insult' },
        { action: 'betray' },
        { action: 'help' },
      ].map((e, i) => createMockEvent(i, e.action));

      const approach = observer.classifySocialApproach(events);
      expect(approach).toBe('hostile');
    });

    it('should classify as manipulative', () => {
      const events = [
        { action: 'bribe' },
        { action: 'intimidate' },
        { action: 'bribe' },
        { action: 'intimidate' },
        { action: 'help' },
      ].map((e, i) => createMockEvent(i, e.action));

      const approach = observer.classifySocialApproach(events);
      expect(approach).toBe('manipulative');
    });

    it('should classify as diplomatic', () => {
      const events = [
        { action: 'persuade' },
        { action: 'befriend' },
        { action: 'persuade' },
        { action: 'befriend' },
        { action: 'insult' },
      ].map((e, i) => createMockEvent(i, e.action));

      const approach = observer.classifySocialApproach(events);
      expect(approach).toBe('diplomatic');
    });

    it('should classify as balanced for mixed actions', () => {
      // Evenly distributed: 2 helpful, 2 hostile, 1 diplomatic, 1 manipulative
      // No single category reaches 40% threshold
      const events = [
        { action: 'help' },
        { action: 'help' },
        { action: 'betray' },
        { action: 'insult' },
        { action: 'persuade' },
        { action: 'intimidate' },
      ].map((e, i) => createMockEvent(i, e.action));

      const approach = observer.classifySocialApproach(events);
      expect(approach).toBe('balanced');
    });

    it('should classify as minimal for too few social events', () => {
      const events = [
        { action: 'help' },
        { action: 'kill' }, // not a social action
      ].map((e, i) => createMockEvent(i, e.action));

      const approach = observer.classifySocialApproach(events);
      expect(approach).toBe('minimal');
    });
  });

  describe('inferDominantTraits', () => {
    it('should infer merciful trait for high mercy ratio', () => {
      const categoryCounts = { mercy: 10, violence: 1, honesty: 0, social: 0, exploration: 0, character: 0 };
      const ratios = { mercyVsViolence: 0.8, honestyVsDeception: 0, helpfulVsHarmful: 0 };
      const violence = { initiatesViolence: false, initiationRatio: 0, totalViolenceEvents: 1, attackFirstEvents: 0 };

      const traits = observer.inferDominantTraits(categoryCounts, ratios, violence, 'balanced');

      expect(traits).toContain('merciful');
    });

    it('should infer ruthless trait for high violence ratio', () => {
      const categoryCounts = { mercy: 1, violence: 10, honesty: 0, social: 0, exploration: 0, character: 0 };
      const ratios = { mercyVsViolence: -0.8, honestyVsDeception: 0, helpfulVsHarmful: 0 };
      const violence = { initiatesViolence: false, initiationRatio: 0, totalViolenceEvents: 10, attackFirstEvents: 0 };

      const traits = observer.inferDominantTraits(categoryCounts, ratios, violence, 'balanced');

      expect(traits).toContain('ruthless');
    });

    it('should infer aggressive trait for violence initiator', () => {
      const categoryCounts = { mercy: 0, violence: 5, honesty: 0, social: 0, exploration: 0, character: 0 };
      const ratios = { mercyVsViolence: 0, honestyVsDeception: 0, helpfulVsHarmful: 0 };
      const violence = { initiatesViolence: true, initiationRatio: 0.6, totalViolenceEvents: 5, attackFirstEvents: 3 };

      const traits = observer.inferDominantTraits(categoryCounts, ratios, violence, 'balanced');

      expect(traits).toContain('aggressive');
    });

    it('should infer honest trait for high honesty ratio', () => {
      const categoryCounts = { mercy: 0, violence: 0, honesty: 10, social: 0, exploration: 0, character: 0 };
      const ratios = { mercyVsViolence: 0, honestyVsDeception: 0.8, helpfulVsHarmful: 0 };
      const violence = { initiatesViolence: false, initiationRatio: 0, totalViolenceEvents: 0, attackFirstEvents: 0 };

      const traits = observer.inferDominantTraits(categoryCounts, ratios, violence, 'balanced');

      expect(traits).toContain('honest');
    });

    it('should infer deceptive trait for low honesty ratio', () => {
      const categoryCounts = { mercy: 0, violence: 0, honesty: 10, social: 0, exploration: 0, character: 0 };
      const ratios = { mercyVsViolence: 0, honestyVsDeception: -0.8, helpfulVsHarmful: 0 };
      const violence = { initiatesViolence: false, initiationRatio: 0, totalViolenceEvents: 0, attackFirstEvents: 0 };

      const traits = observer.inferDominantTraits(categoryCounts, ratios, violence, 'balanced');

      expect(traits).toContain('deceptive');
    });

    it('should infer altruistic trait for helpful social approach', () => {
      const categoryCounts = { mercy: 0, violence: 0, honesty: 0, social: 10, exploration: 0, character: 0 };
      const ratios = { mercyVsViolence: 0, honestyVsDeception: 0, helpfulVsHarmful: 0.5 };
      const violence = { initiatesViolence: false, initiationRatio: 0, totalViolenceEvents: 0, attackFirstEvents: 0 };

      const traits = observer.inferDominantTraits(categoryCounts, ratios, violence, 'helpful');

      expect(traits).toContain('altruistic');
    });

    it('should infer curious trait for high exploration', () => {
      const categoryCounts = { mercy: 0, violence: 0, honesty: 0, social: 0, exploration: 5, character: 1 };
      const ratios = { mercyVsViolence: 0, honestyVsDeception: 0, helpfulVsHarmful: 0 };
      const violence = { initiatesViolence: false, initiationRatio: 0, totalViolenceEvents: 0, attackFirstEvents: 0 };

      const traits = observer.inferDominantTraits(categoryCounts, ratios, violence, 'balanced');

      expect(traits).toContain('curious');
    });

    it('should infer multiple traits when patterns overlap', () => {
      const categoryCounts = { mercy: 8, violence: 2, honesty: 10, social: 5, exploration: 8, character: 3 };
      const ratios = { mercyVsViolence: 0.6, honestyVsDeception: 0.7, helpfulVsHarmful: 0 };
      const violence = { initiatesViolence: false, initiationRatio: 0.1, totalViolenceEvents: 2, attackFirstEvents: 0 };

      const traits = observer.inferDominantTraits(categoryCounts, ratios, violence, 'helpful');

      expect(traits).toContain('merciful');
      expect(traits).toContain('honest');
      expect(traits).toContain('altruistic');
    });
  });

  describe('configuration', () => {
    it('should respect custom minEventsForAnalysis', () => {
      const customObserver = new PatternObserver(eventRepo, { minEventsForAnalysis: 10 });

      // Create only 5 social events
      for (let i = 0; i < 5; i++) {
        eventRepo.create({
          gameId: 'game-1',
          turn: i + 1,
          eventType: 'party_action',
          content: `Help event ${i}`,
          locationId: 'area-1',
          witnesses: [],
          action: 'help',
          actorType: 'player',
          actorId: 'player-1',
        });
      }

      const events = eventRepo.findByActor('game-1', 'player', 'player-1');
      const approach = customObserver.classifySocialApproach(events);

      // Should be minimal because we need 10 events, only have 5
      expect(approach).toBe('minimal');
    });

    it('should respect custom minCategoryEventsForRatio', () => {
      const customObserver = new PatternObserver(eventRepo, { minCategoryEventsForRatio: 10 });

      // Create only 5 mercy events
      for (let i = 0; i < 5; i++) {
        eventRepo.create({
          gameId: 'game-1',
          turn: i + 1,
          eventType: 'party_action',
          content: `Mercy event ${i}`,
          locationId: 'area-1',
          witnesses: [],
          action: 'spare_enemy',
          actorType: 'player',
          actorId: 'player-1',
        });
      }

      const ratio = customObserver.calculateRatio('game-1', 'player-1', 'mercy', 'violence');

      // Should be null because we need 10 events, only have 5
      expect(ratio).toBeNull();
    });
  });
});

// Helper to create mock events for testing classifySocialApproach
function createMockEvent(turn: number, action: string) {
  return {
    id: `event-${turn}`,
    gameId: 'game-1',
    turn,
    timestamp: new Date().toISOString(),
    eventType: 'party_action' as const,
    content: `Event ${turn}`,
    locationId: 'area-1',
    witnesses: [],
    action,
    actorType: 'player' as const,
    actorId: 'player-1',
  };
}
