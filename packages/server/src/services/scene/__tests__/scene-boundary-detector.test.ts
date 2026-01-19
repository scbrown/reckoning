import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SceneBoundaryDetector } from '../scene-boundary-detector.js';
import { SceneRepository } from '../../../db/repositories/scene-repository.js';
import { EventRepository } from '../../../db/repositories/event-repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('SceneBoundaryDetector', () => {
  let db: Database.Database;
  let sceneRepo: SceneRepository;
  let eventRepo: EventRepository;
  let detector: SceneBoundaryDetector;

  beforeEach(() => {
    db = new Database(':memory:');
    const schemaPath = join(__dirname, '../../../db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    // Create test areas (required for foreign key constraints)
    db.exec(`
      INSERT INTO areas (id, name, description, tags)
      VALUES
        ('area-1', 'Test Area 1', 'A test area', '[]'),
        ('area-2', 'Test Area 2', 'Another test area', '[]')
    `);

    // Create test game
    db.exec(`
      INSERT INTO games (id, player_id, current_area_id, turn)
      VALUES ('game-1', 'player-1', 'area-1', 10)
    `);

    sceneRepo = new SceneRepository(db);
    eventRepo = new EventRepository(db);

    detector = new SceneBoundaryDetector({
      eventRepo,
      sceneRepo,
    });
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('analyze', () => {
    it('should return empty suggestion when no active scene', () => {
      const suggestion = detector.analyze('game-1', 10);

      expect(suggestion.shouldEndScene).toBe(false);
      expect(suggestion.confidence).toBe(0);
      expect(suggestion.signals).toHaveLength(0);
      expect(suggestion.sceneContext.sceneId).toBe('');
    });

    it('should return no suggestion for fresh scene', () => {
      const scene = sceneRepo.create({
        gameId: 'game-1',
        startedTurn: 1,
        name: 'Test Scene',
        locationId: 'area-1',
      });

      const suggestion = detector.analyze('game-1', 2);

      expect(suggestion.shouldEndScene).toBe(false);
      expect(suggestion.signals).toHaveLength(0);
      expect(suggestion.sceneContext.sceneId).toBe(scene.id);
    });
  });

  describe('location change detection', () => {
    it('should detect enter_location action', () => {
      sceneRepo.create({
        gameId: 'game-1',
        startedTurn: 1,
        locationId: 'area-1',
      });

      // Add event with enter_location action
      eventRepo.create({
        gameId: 'game-1',
        turn: 2,
        eventType: 'narration',
        content: 'The party enters the dark cave',
        locationId: 'area-2',
        witnesses: [],
        action: 'enter_location',
      });

      const suggestion = detector.analyze('game-1', 2);

      expect(suggestion.signals.length).toBeGreaterThan(0);
      const locationSignal = suggestion.signals.find(s => s.type === 'location_change');
      expect(locationSignal).toBeDefined();
      expect(locationSignal!.strength).toBeCloseTo(0.9);
      expect(locationSignal!.reason).toBe('Party entered a new location');
    });

    it('should detect implicit location change from scene start', () => {
      sceneRepo.create({
        gameId: 'game-1',
        startedTurn: 1,
        locationId: 'area-1',
      });

      // Add only an event at a DIFFERENT location than scene start
      // This creates a clear implicit location change
      eventRepo.create({
        gameId: 'game-1',
        turn: 2,
        eventType: 'narration',
        content: 'Now in a different place',
        locationId: 'area-2',
        witnesses: [],
      });

      const suggestion = detector.analyze('game-1', 2);

      const locationSignal = suggestion.signals.find(s => s.type === 'location_change');
      expect(locationSignal).toBeDefined();
      expect(locationSignal!.strength).toBeCloseTo(0.9 * 0.8); // Reduced strength for implicit
    });
  });

  describe('confrontation resolution detection', () => {
    it('should detect explicit confrontation_end tag', () => {
      sceneRepo.create({
        gameId: 'game-1',
        startedTurn: 1,
        locationId: 'area-1',
        mood: 'action',
      });

      eventRepo.create({
        gameId: 'game-1',
        turn: 2,
        eventType: 'narration',
        content: 'The battle ends',
        locationId: 'area-1',
        witnesses: [],
        tags: ['confrontation_end'],
      });

      const suggestion = detector.analyze('game-1', 2);

      const confrontationSignal = suggestion.signals.find(s => s.type === 'confrontation_resolved');
      expect(confrontationSignal).toBeDefined();
      expect(confrontationSignal!.strength).toBeCloseTo(0.8);
      expect(confrontationSignal!.reason).toBe('Confrontation explicitly ended');
    });

    it('should detect violence followed by mercy pattern', () => {
      sceneRepo.create({
        gameId: 'game-1',
        startedTurn: 1,
        locationId: 'area-1',
      });

      // Violence action on turn 1
      eventRepo.create({
        gameId: 'game-1',
        turn: 1,
        eventType: 'party_action',
        content: 'The party attacks',
        locationId: 'area-1',
        witnesses: [],
        action: 'attack_first',
      });

      // More violence to establish pattern
      eventRepo.create({
        gameId: 'game-1',
        turn: 2,
        eventType: 'party_action',
        content: 'The battle continues',
        locationId: 'area-1',
        witnesses: [],
        action: 'kill',
      });

      // Mercy action after violence on turn 3
      eventRepo.create({
        gameId: 'game-1',
        turn: 3,
        eventType: 'party_action',
        content: 'They spare the defeated foe',
        locationId: 'area-1',
        witnesses: [],
        action: 'spare_enemy',
      });

      const suggestion = detector.analyze('game-1', 3);

      const confrontationSignal = suggestion.signals.find(s => s.type === 'confrontation_resolved');
      expect(confrontationSignal).toBeDefined();
      expect(confrontationSignal!.reason).toContain('mercy action');
    });

    it('should not suggest resolution when violence is ongoing', () => {
      sceneRepo.create({
        gameId: 'game-1',
        startedTurn: 1,
        locationId: 'area-1',
      });

      // Just violence, no resolution
      eventRepo.create({
        gameId: 'game-1',
        turn: 1,
        eventType: 'party_action',
        content: 'The party attacks',
        locationId: 'area-1',
        witnesses: [],
        action: 'attack_first',
        tags: ['confrontation'],
      });

      const suggestion = detector.analyze('game-1', 1);

      const confrontationSignal = suggestion.signals.find(s => s.type === 'confrontation_resolved');
      expect(confrontationSignal).toBeUndefined();
    });
  });

  describe('mood shift detection', () => {
    it('should detect contrasting mood from action to peaceful', () => {
      sceneRepo.create({
        gameId: 'game-1',
        startedTurn: 1,
        locationId: 'area-1',
        mood: 'action',
      });

      // Add peaceful events
      for (let i = 1; i <= 5; i++) {
        eventRepo.create({
          gameId: 'game-1',
          turn: i,
          eventType: 'party_dialogue',
          content: 'Friendly conversation',
          locationId: 'area-1',
          witnesses: [],
          action: 'befriend',
        });
      }

      const suggestion = detector.analyze('game-1', 5);

      const moodSignal = suggestion.signals.find(s => s.type === 'mood_shift');
      expect(moodSignal).toBeDefined();
      expect(moodSignal!.reason).toContain('action');
    });

    it('should not detect mood shift when no scene mood is set', () => {
      sceneRepo.create({
        gameId: 'game-1',
        startedTurn: 1,
        locationId: 'area-1',
        // No mood set
      });

      eventRepo.create({
        gameId: 'game-1',
        turn: 1,
        eventType: 'party_action',
        content: 'Something happens',
        locationId: 'area-1',
        witnesses: [],
        action: 'attack_first',
      });

      const suggestion = detector.analyze('game-1', 1);

      const moodSignal = suggestion.signals.find(s => s.type === 'mood_shift');
      expect(moodSignal).toBeUndefined();
    });
  });

  describe('long duration detection', () => {
    it('should detect long duration based on turns', () => {
      sceneRepo.create({
        gameId: 'game-1',
        startedTurn: 1,
        locationId: 'area-1',
      });

      // Scene has been running for 10 turns (threshold is 8)
      const suggestion = detector.analyze('game-1', 11);

      const durationSignal = suggestion.signals.find(s => s.type === 'long_duration');
      expect(durationSignal).toBeDefined();
      expect(durationSignal!.reason).toContain('10 turns');
    });

    it('should detect long duration based on events', () => {
      sceneRepo.create({
        gameId: 'game-1',
        startedTurn: 1,
        locationId: 'area-1',
      });

      // Add 16 events (threshold is 15)
      for (let i = 1; i <= 16; i++) {
        eventRepo.create({
          gameId: 'game-1',
          turn: 1 + Math.floor(i / 4), // Spread across turns
          eventType: 'narration',
          content: `Event ${i}`,
          locationId: 'area-1',
          witnesses: [],
        });
      }

      const suggestion = detector.analyze('game-1', 5);

      const durationSignal = suggestion.signals.find(s => s.type === 'long_duration');
      expect(durationSignal).toBeDefined();
      expect(durationSignal!.reason).toContain('16 events');
    });

    it('should not trigger for short scenes', () => {
      sceneRepo.create({
        gameId: 'game-1',
        startedTurn: 5,
        locationId: 'area-1',
      });

      const suggestion = detector.analyze('game-1', 7); // Only 2 turns

      const durationSignal = suggestion.signals.find(s => s.type === 'long_duration');
      expect(durationSignal).toBeUndefined();
    });
  });

  describe('confidence calculation', () => {
    it('should calculate confidence from multiple signals', () => {
      sceneRepo.create({
        gameId: 'game-1',
        startedTurn: 1,
        locationId: 'area-1',
        mood: 'action',
      });

      // Add location change
      eventRepo.create({
        gameId: 'game-1',
        turn: 2,
        eventType: 'narration',
        content: 'Enter new area',
        locationId: 'area-2',
        witnesses: [],
        action: 'enter_location',
      });

      // Add confrontation end tag
      eventRepo.create({
        gameId: 'game-1',
        turn: 3,
        eventType: 'narration',
        content: 'Battle ends',
        locationId: 'area-2',
        witnesses: [],
        tags: ['confrontation_end'],
      });

      const suggestion = detector.analyze('game-1', 3);

      expect(suggestion.confidence).toBeGreaterThan(0);
      expect(suggestion.signals.length).toBeGreaterThanOrEqual(2);
    });

    it('should set shouldEndScene based on confidence threshold', () => {
      sceneRepo.create({
        gameId: 'game-1',
        startedTurn: 1,
        locationId: 'area-1',
      });

      // Strong signal - location change
      eventRepo.create({
        gameId: 'game-1',
        turn: 2,
        eventType: 'narration',
        content: 'Enter new area',
        locationId: 'area-2',
        witnesses: [],
        action: 'enter_location',
      });

      const suggestion = detector.analyze('game-1', 2);

      // Location change (0.9) should exceed default threshold (0.6)
      expect(suggestion.shouldEndScene).toBe(true);
    });
  });

  describe('configuration', () => {
    it('should use custom thresholds', () => {
      const customDetector = new SceneBoundaryDetector(
        { eventRepo, sceneRepo },
        {
          longDurationTurns: 3, // Much shorter threshold
        }
      );

      sceneRepo.create({
        gameId: 'game-1',
        startedTurn: 1,
        locationId: 'area-1',
      });

      const suggestion = customDetector.analyze('game-1', 5); // 4 turns

      const durationSignal = suggestion.signals.find(s => s.type === 'long_duration');
      expect(durationSignal).toBeDefined();
    });

    it('should allow runtime config updates', () => {
      sceneRepo.create({
        gameId: 'game-1',
        startedTurn: 1,
        locationId: 'area-1',
      });

      // Default threshold (8 turns) - should not trigger
      let suggestion = detector.analyze('game-1', 6); // 5 turns
      let durationSignal = suggestion.signals.find(s => s.type === 'long_duration');
      expect(durationSignal).toBeUndefined();

      // Update threshold
      detector.updateConfig({ longDurationTurns: 3 });

      // Now should trigger
      suggestion = detector.analyze('game-1', 6);
      durationSignal = suggestion.signals.find(s => s.type === 'long_duration');
      expect(durationSignal).toBeDefined();
    });

    it('should return current config', () => {
      const config = detector.getConfig();

      expect(config.confidenceThreshold).toBe(0.6);
      expect(config.longDurationTurns).toBe(8);
      expect(config.longDurationEvents).toBe(15);
      expect(config.locationChangeWeight).toBe(0.9);
    });
  });

  describe('scene context', () => {
    it('should include scene context in suggestion', () => {
      const scene = sceneRepo.create({
        gameId: 'game-1',
        startedTurn: 3,
        locationId: 'area-1',
        mood: 'tense',
      });

      // Add an event
      eventRepo.create({
        gameId: 'game-1',
        turn: 3,
        eventType: 'narration',
        content: 'Something happens',
        locationId: 'area-1',
        witnesses: [],
      });

      const suggestion = detector.analyze('game-1', 5);

      expect(suggestion.sceneContext.sceneId).toBe(scene.id);
      expect(suggestion.sceneContext.startedTurn).toBe(3);
      expect(suggestion.sceneContext.currentTurn).toBe(5);
      expect(suggestion.sceneContext.eventCount).toBe(1);
      expect(suggestion.sceneContext.currentMood).toBe('tense');
    });

    it('should get current location from latest event', () => {
      sceneRepo.create({
        gameId: 'game-1',
        startedTurn: 1,
        locationId: 'area-1',
      });

      // Only add one event at the new location
      // This ensures the current location is clearly from this event
      eventRepo.create({
        gameId: 'game-1',
        turn: 2,
        eventType: 'narration',
        content: 'Event at new location',
        locationId: 'area-2',
        witnesses: [],
      });

      const suggestion = detector.analyze('game-1', 2);

      expect(suggestion.sceneContext.currentLocationId).toBe('area-2');
    });
  });

  describe('edge cases', () => {
    it('should handle scene with no events', () => {
      sceneRepo.create({
        gameId: 'game-1',
        startedTurn: 1,
        locationId: 'area-1',
      });

      const suggestion = detector.analyze('game-1', 1);

      expect(suggestion.sceneContext.eventCount).toBe(0);
      expect(suggestion.signals).toHaveLength(0);
    });

    it('should handle non-existent game', () => {
      const suggestion = detector.analyze('non-existent', 1);

      expect(suggestion.shouldEndScene).toBe(false);
      expect(suggestion.confidence).toBe(0);
    });

    it('should handle completed scenes (not active)', () => {
      const scene = sceneRepo.create({
        gameId: 'game-1',
        startedTurn: 1,
        locationId: 'area-1',
      });
      sceneRepo.completeScene(scene.id, 5);

      const suggestion = detector.analyze('game-1', 10);

      // Completed scene is not active, so no suggestion
      expect(suggestion.shouldEndScene).toBe(false);
      expect(suggestion.sceneContext.sceneId).toBe('');
    });
  });
});
