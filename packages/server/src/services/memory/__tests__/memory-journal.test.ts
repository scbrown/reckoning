import { describe, it, expect } from 'vitest';
import { DistortionEngine } from '../memory-journal.js';
import type { CanonicalEvent } from '@reckoning/shared';
import type { CharacterPsychology } from '../memory-journal.js';
import type { PlayerPatterns } from '../../chronicle/types.js';

function makeEvent(overrides: Partial<CanonicalEvent> = {}): CanonicalEvent {
  return {
    id: 'event-1',
    gameId: 'game-1',
    turn: 5,
    timestamp: '2026-01-01T00:00:00Z',
    eventType: 'party_action',
    content: 'The warrior strikes the bandit with a powerful blow.',
    locationId: 'tavern',
    witnesses: [],
    action: 'attack_first',
    actorType: 'player',
    actorId: 'player-1',
    ...overrides,
  };
}

function makePsychology(overrides: Partial<CharacterPsychology> = {}): CharacterPsychology {
  return {
    traits: ['aggressive', 'ruthless'],
    ...overrides,
  };
}

function makePatterns(overrides: Partial<PlayerPatterns> = {}): PlayerPatterns {
  return {
    playerId: 'player-1',
    gameId: 'game-1',
    totalEvents: 20,
    categoryCounts: {
      mercy: 2,
      violence: 8,
      honesty: 3,
      social: 4,
      exploration: 2,
      character: 1,
    },
    ratios: {
      mercyVsViolence: -0.6,
      honestyVsDeception: -0.4,
      helpfulVsHarmful: 0.0,
    },
    violenceInitiation: {
      initiatesViolence: true,
      initiationRatio: 0.6,
      totalViolenceEvents: 8,
      attackFirstEvents: 5,
    },
    socialApproach: 'hostile',
    dominantTraits: ['aggressive', 'ruthless', 'deceptive'],
    ...overrides,
  };
}

describe('DistortionEngine', () => {
  describe('analyzeEvent', () => {
    it('returns faithful for mundane events', () => {
      const engine = new DistortionEngine({ faithfulRate: 0.0 });
      const event = makeEvent({ action: 'rest', content: 'The party rests at the inn.' });
      const psychology = makePsychology({ traits: [] });

      const analysis = engine.analyzeEvent(event, psychology);
      // rest is in the mundane list, higher chance of faithful
      expect(['faithful', 'false_competence']).toContain(analysis.distortionType);
    });

    it('selects guilt_suppression for attack_first events', () => {
      const engine = new DistortionEngine({ faithfulRate: 0.0 });
      const event = makeEvent({ action: 'attack_first' });
      const psychology = makePsychology({ traits: ['aggressive', 'ruthless'] });

      // Run multiple times to find at least one guilt_suppression
      let foundGuilt = false;
      for (let i = 0; i < 20; i++) {
        const analysis = engine.analyzeEvent(event, psychology);
        if (analysis.distortionType === 'guilt_suppression') {
          foundGuilt = true;
          break;
        }
      }
      expect(foundGuilt).toBe(true);
    });

    it('selects villain_projecting for betrayal events', () => {
      const engine = new DistortionEngine({ faithfulRate: 0.0 });
      const event = makeEvent({
        action: 'betray',
        content: 'The rogue betrays the merchant\'s trust.',
      });
      const psychology = makePsychology({ traits: ['deceptive', 'cunning'] });

      let foundVillain = false;
      for (let i = 0; i < 20; i++) {
        const analysis = engine.analyzeEvent(event, psychology);
        if (analysis.distortionType === 'villain_projecting') {
          foundVillain = true;
          break;
        }
      }
      expect(foundVillain).toBe(true);
    });

    it('selects hero_framing for mercy events', () => {
      const engine = new DistortionEngine({ faithfulRate: 0.0 });
      const event = makeEvent({
        action: 'spare_enemy',
        content: 'The paladin spares the defeated goblin.',
      });
      const psychology = makePsychology({ traits: ['merciful', 'altruistic'] });

      let foundHero = false;
      for (let i = 0; i < 20; i++) {
        const analysis = engine.analyzeEvent(event, psychology);
        if (analysis.distortionType === 'hero_framing' || analysis.distortionType === 'self_aggrandizing') {
          foundHero = true;
          break;
        }
      }
      expect(foundHero).toBe(true);
    });

    it('includes influencing traits in the analysis', () => {
      const engine = new DistortionEngine({ faithfulRate: 0.0 });
      const event = makeEvent({ action: 'attack_first' });
      const psychology = makePsychology({ traits: ['aggressive', 'ruthless'] });

      // Find a non-faithful analysis
      let analysis;
      for (let i = 0; i < 20; i++) {
        analysis = engine.analyzeEvent(event, psychology);
        if (analysis.distortionType !== 'faithful') break;
      }

      if (analysis && analysis.distortionType !== 'faithful') {
        // Influencing traits should be a subset of character traits
        for (const trait of analysis.influencingTraits) {
          expect(psychology.traits).toContain(trait);
        }
      }
    });

    it('generates a journal prompt for distorted memories', () => {
      const engine = new DistortionEngine({ faithfulRate: 0.0 });
      const event = makeEvent({ action: 'attack_first' });
      const psychology = makePsychology({ traits: ['aggressive'] });

      let analysis;
      for (let i = 0; i < 20; i++) {
        analysis = engine.analyzeEvent(event, psychology);
        if (analysis.distortionType !== 'faithful') break;
      }

      if (analysis && analysis.distortionType !== 'faithful') {
        expect(analysis.journalPrompt).toContain('first-person journal entry');
        expect(analysis.journalPrompt).toContain('distorted');
        expect(analysis.journalPrompt).toContain(event.content);
      }
    });

    it('generates faithful prompt for undistorted memories', () => {
      const engine = new DistortionEngine({ faithfulRate: 1.0 }); // Always faithful
      const event = makeEvent();
      const psychology = makePsychology({ traits: [] });

      const analysis = engine.analyzeEvent(event, psychology);
      expect(analysis.distortionType).toBe('faithful');
      expect(analysis.distortionStrength).toBe(0);
      expect(analysis.journalPrompt).toContain('accurate');
    });

    it('honest characters have higher faithful rate', () => {
      const engine = new DistortionEngine({ faithfulRate: 0.0 });
      const event = makeEvent({ action: 'attack_first' });
      const psychology = makePsychology({ traits: ['honest'] });

      let faithfulCount = 0;
      for (let i = 0; i < 50; i++) {
        const analysis = engine.analyzeEvent(event, psychology);
        if (analysis.distortionType === 'faithful') faithfulCount++;
      }

      // Honest characters should be faithful more often than 0%
      expect(faithfulCount).toBeGreaterThan(0);
    });

    it('boosts distortion for deceptive patterns', () => {
      const engine = new DistortionEngine({ faithfulRate: 0.0 });
      const event = makeEvent({ action: 'betray' });
      const patterns = makePatterns({
        ratios: {
          mercyVsViolence: 0.0,
          honestyVsDeception: -0.8,
          helpfulVsHarmful: 0.0,
        },
      });
      const psychology = makePsychology({
        traits: ['deceptive', 'cunning'],
        patterns,
      });

      let maxStrength = 0;
      for (let i = 0; i < 20; i++) {
        const analysis = engine.analyzeEvent(event, psychology);
        if (analysis.distortionStrength > maxStrength) {
          maxStrength = analysis.distortionStrength;
        }
      }

      expect(maxStrength).toBeGreaterThan(0.3);
    });
  });

  describe('buildMemoryInput', () => {
    it('creates valid CreateMemoryInput', () => {
      const engine = new DistortionEngine();
      const event = makeEvent();
      const analysis = engine.analyzeEvent(event, makePsychology());

      const input = engine.buildMemoryInput(event, analysis, 'I remember the battle well...');

      expect(input.gameId).toBe('game-1');
      expect(input.characterId).toBe('player-1');
      expect(input.sourceEventId).toBe('event-1');
      expect(input.turn).toBe(5);
      expect(input.content).toBe('I remember the battle well...');
      expect(input.distortionType).toBe(analysis.distortionType);
      expect(input.distortionStrength).toBe(analysis.distortionStrength);
    });

    it('includes influencing traits when present', () => {
      const engine = new DistortionEngine({ faithfulRate: 0.0 });
      const event = makeEvent({ action: 'attack_first' });
      const psychology = makePsychology({ traits: ['aggressive', 'ruthless'] });

      // Find an analysis with influencing traits
      let analysis;
      for (let i = 0; i < 20; i++) {
        analysis = engine.analyzeEvent(event, psychology);
        if (analysis.influencingTraits.length > 0) break;
      }

      if (analysis && analysis.influencingTraits.length > 0) {
        const input = engine.buildMemoryInput(event, analysis, 'content');
        expect(input.influencingTraits).toBeDefined();
        expect(input.influencingTraits!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('distortion variety', () => {
    it('produces different distortion types across multiple analyses', () => {
      const engine = new DistortionEngine({ faithfulRate: 0.1 });
      const types = new Set<string>();

      // Use different event types to trigger different distortions
      const events = [
        makeEvent({ action: 'attack_first', id: 'e1' }),
        makeEvent({ action: 'betray', id: 'e2', content: 'Betrayal.' }),
        makeEvent({ action: 'spare_enemy', id: 'e3', content: 'Mercy.' }),
        makeEvent({ action: 'lie', id: 'e4', content: 'A lie.' }),
        makeEvent({ action: 'use_ability', id: 'e5', content: 'Used an ability.' }),
        makeEvent({ action: 'torture', id: 'e6', content: 'Torture.' }),
      ];

      const psychology = makePsychology({
        traits: ['aggressive', 'deceptive', 'merciful', 'curious', 'cunning', 'contemplative'],
      });

      for (const event of events) {
        for (let i = 0; i < 5; i++) {
          const analysis = engine.analyzeEvent(event, psychology);
          types.add(analysis.distortionType);
        }
      }

      // Should have at least 3 different distortion types across all events
      expect(types.size).toBeGreaterThanOrEqual(3);
    });
  });
});
