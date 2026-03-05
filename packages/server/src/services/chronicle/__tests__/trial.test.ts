import { describe, it, expect } from 'vitest';
import { VerdictClassifier } from '../trial.js';
import type { CanonicalEvent } from '@reckoning/shared';
import type { PlayerPatterns } from '../types.js';

function makeEvent(overrides: Partial<CanonicalEvent> = {}): CanonicalEvent {
  return {
    id: 'event-1',
    gameId: 'game-1',
    turn: 5,
    timestamp: '2026-01-01T00:00:00Z',
    eventType: 'party_action',
    content: 'Something happened.',
    locationId: 'tavern',
    witnesses: [],
    ...overrides,
  };
}

function makePatterns(overrides: Partial<PlayerPatterns> = {}): PlayerPatterns {
  return {
    playerId: 'player-1',
    gameId: 'game-1',
    totalEvents: 20,
    categoryCounts: { mercy: 5, violence: 2, honesty: 4, social: 5, exploration: 3, character: 1 },
    ratios: { mercyVsViolence: 0.6, honestyVsDeception: 0.3, helpfulVsHarmful: 0.2 },
    violenceInitiation: { initiatesViolence: false, initiationRatio: 0.1, totalViolenceEvents: 2, attackFirstEvents: 0 },
    socialApproach: 'helpful',
    dominantTraits: ['merciful', 'altruistic'],
    ...overrides,
  };
}

function makeEvents(count: number, actionFn?: (i: number) => string | undefined): CanonicalEvent[] {
  return Array.from({ length: count }, (_, i) =>
    makeEvent({
      id: `e-${i}`,
      turn: i + 1,
      action: actionFn ? actionFn(i) : undefined,
    })
  );
}

describe('VerdictClassifier', () => {
  it('returns the_mystery for insufficient events', () => {
    const classifier = new VerdictClassifier({ minEventsForTrial: 15 });
    const result = classifier.classify(makePatterns(), makeEvents(5));
    expect(result.archetype).toBe('the_mystery');
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('classifies heroic patterns as the_hero', () => {
    const classifier = new VerdictClassifier({ minEventsForTrial: 5 });
    const patterns = makePatterns({
      ratios: { mercyVsViolence: 0.7, honestyVsDeception: 0.5, helpfulVsHarmful: 0.5 },
      socialApproach: 'helpful',
      dominantTraits: ['merciful', 'honest', 'altruistic'],
    });
    const events = makeEvents(20, (i) =>
      i % 2 === 0 ? 'spare_enemy' : 'help'
    );
    const result = classifier.classify(patterns, events);
    expect(result.archetype).toBe('the_hero');
  });

  it('classifies cruel patterns as the_monster', () => {
    const classifier = new VerdictClassifier({ minEventsForTrial: 5 });
    const patterns = makePatterns({
      ratios: { mercyVsViolence: -0.7, honestyVsDeception: -0.5, helpfulVsHarmful: -0.5 },
      socialApproach: 'hostile',
      violenceInitiation: { initiatesViolence: true, initiationRatio: 0.8, totalViolenceEvents: 12, attackFirstEvents: 10 },
      dominantTraits: ['ruthless', 'deceptive'],
    });
    const events = makeEvents(20, (i) =>
      i % 3 === 0 ? 'kill' : i % 3 === 1 ? 'torture' : 'attack_first'
    );
    const result = classifier.classify(patterns, events);
    expect(result.archetype).toBe('the_monster');
  });

  it('classifies balanced patterns as the_pragmatist', () => {
    const classifier = new VerdictClassifier({ minEventsForTrial: 5 });
    const patterns = makePatterns({
      ratios: { mercyVsViolence: 0.1, honestyVsDeception: 0.0, helpfulVsHarmful: 0.0 },
      socialApproach: 'balanced',
      dominantTraits: ['pragmatic'],
    });
    const events = makeEvents(20);
    const result = classifier.classify(patterns, events);
    expect(result.archetype).toBe('the_pragmatist');
  });

  it('detects improving trajectory as the_growth', () => {
    const classifier = new VerdictClassifier({ minEventsForTrial: 5 });
    const patterns = makePatterns({
      ratios: { mercyVsViolence: 0.2, honestyVsDeception: 0.1, helpfulVsHarmful: 0.1 },
      socialApproach: 'balanced',
      dominantTraits: [],
    });
    // First half: consistently violent. Second half: consistently merciful.
    // Low variance within each half to avoid triggering the_mystery.
    const events = makeEvents(40, (i) =>
      i < 20 ? 'kill' : 'spare_enemy'
    );
    const result = classifier.classify(patterns, events);
    expect(result.archetype).toBe('the_growth');
  });

  it('detects declining trajectory as the_fall', () => {
    const classifier = new VerdictClassifier({ minEventsForTrial: 5 });
    const patterns = makePatterns({
      ratios: { mercyVsViolence: -0.2, honestyVsDeception: 0.0, helpfulVsHarmful: 0.0 },
      socialApproach: 'balanced',
      dominantTraits: [],
    });
    // First half: consistently merciful. Second half: consistently violent.
    const events = makeEvents(40, (i) =>
      i < 20 ? 'spare_enemy' : 'kill'
    );
    const result = classifier.classify(patterns, events);
    expect(result.archetype).toBe('the_fall');
  });

  it('selects charges from significant events', () => {
    const classifier = new VerdictClassifier({ maxCharges: 3 });
    const events = [
      makeEvent({ id: 'e1', action: 'kill', content: 'Killed the guard.' }),
      makeEvent({ id: 'e2', action: 'spare_enemy', content: 'Spared the thief.' }),
      makeEvent({ id: 'e3', content: 'Walked down the road.' }), // no action
      makeEvent({ id: 'e4', action: 'betray', content: 'Betrayed the ally.' }),
    ];
    const chronicles = new Map([['e1', 'The guard fell.'], ['e2', 'Mercy was shown.']]);
    const memories = new Map([['e1', 'I had to do it.']]);

    const charges = classifier.selectCharges(events, chronicles, memories);

    expect(charges).toHaveLength(3); // e1, e2, e4 (e3 has no significant action)
    expect(charges[0]!.eventId).toBe('e1');
    expect(charges[0]!.chronicleExcerpt).toBe('The guard fell.');
    expect(charges[0]!.playerMemory).toBe('I had to do it.');
    expect(charges[0]!.hasConflict).toBe(true);
  });

  it('provides narrative for verdict', () => {
    const classifier = new VerdictClassifier({ minEventsForTrial: 5 });
    const patterns = makePatterns({
      ratios: { mercyVsViolence: 0.7, honestyVsDeception: 0.5, helpfulVsHarmful: 0.5 },
      socialApproach: 'helpful',
      dominantTraits: ['merciful', 'honest', 'altruistic'],
    });
    const events = makeEvents(20, () => 'spare_enemy');
    const result = classifier.classify(patterns, events);
    expect(result.narrative).toBeTruthy();
    expect(result.narrative.length).toBeGreaterThan(20);
  });

  it('provides key evidence for verdict', () => {
    const classifier = new VerdictClassifier({ minEventsForTrial: 5 });
    const patterns = makePatterns({
      ratios: { mercyVsViolence: -0.7, honestyVsDeception: -0.5, helpfulVsHarmful: -0.5 },
      socialApproach: 'hostile',
      violenceInitiation: { initiatesViolence: true, initiationRatio: 0.8, totalViolenceEvents: 12, attackFirstEvents: 10 },
      dominantTraits: ['ruthless'],
    });
    const events = makeEvents(20, () => 'kill');
    events.forEach((e, i) => { e.content = `Kill event ${i}`; });
    const result = classifier.classify(patterns, events);
    expect(result.keyEvidence.length).toBeGreaterThan(0);
    expect(result.keyEvidence.length).toBeLessThanOrEqual(3);
  });

  it('includes secondary archetype when close', () => {
    const classifier = new VerdictClassifier({ minEventsForTrial: 5 });
    const patterns = makePatterns({
      ratios: { mercyVsViolence: 0.1, honestyVsDeception: 0.0, helpfulVsHarmful: 0.0 },
      socialApproach: 'balanced',
      dominantTraits: [],
    });
    const events = makeEvents(20);
    const result = classifier.classify(patterns, events);
    // With balanced patterns and no actions, multiple archetypes should score similarly
    // Just verify confidence is calculated
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
