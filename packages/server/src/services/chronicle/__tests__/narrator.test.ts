import { describe, it, expect } from 'vitest';
import { ChronicleNarrator } from '../narrator.js';
import type { CanonicalEvent } from '@reckoning/shared';
import type { PlayerPatterns } from '../types.js';

function makeEvent(overrides: Partial<CanonicalEvent> = {}): CanonicalEvent {
  return {
    id: 'event-1',
    gameId: 'game-1',
    turn: 5,
    timestamp: '2026-01-01T00:00:00Z',
    eventType: 'party_action',
    content: 'The warrior defeats the bandit.',
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

describe('ChronicleNarrator', () => {
  it('returns empty result for no events', () => {
    const narrator = new ChronicleNarrator();
    const result = narrator.narrate([]);
    expect(result.prompt).toBe('');
    expect(result.sourceEventIds).toHaveLength(0);
  });

  it('generates prompt for events', () => {
    const narrator = new ChronicleNarrator();
    const events = [makeEvent()];
    const result = narrator.narrate(events);

    expect(result.prompt).toContain('Chronicle');
    expect(result.prompt).toContain(events[0]!.content);
    expect(result.sourceEventIds).toEqual(['event-1']);
  });

  it('selects sympathetic bias for merciful helpful players', () => {
    const narrator = new ChronicleNarrator({ dynamicBias: true });
    const patterns = makePatterns({
      ratios: { mercyVsViolence: 0.7, honestyVsDeception: 0.5, helpfulVsHarmful: 0.5 },
      socialApproach: 'helpful',
    });
    const result = narrator.narrate([makeEvent()], patterns);
    expect(result.bias).toBe('sympathetic');
  });

  it('selects hostile bias for violent deceptive players', () => {
    const narrator = new ChronicleNarrator({ dynamicBias: true });
    const patterns = makePatterns({
      ratios: { mercyVsViolence: -0.5, honestyVsDeception: -0.3, helpfulVsHarmful: -0.5 },
      socialApproach: 'hostile',
    });
    const result = narrator.narrate([makeEvent()], patterns);
    expect(result.bias).toBe('hostile');
  });

  it('selects mocking bias for contradictory players', () => {
    const narrator = new ChronicleNarrator({ dynamicBias: true });
    const patterns = makePatterns({
      ratios: { mercyVsViolence: 0.5, honestyVsDeception: 0.3, helpfulVsHarmful: 0.3 },
      violenceInitiation: { initiatesViolence: true, initiationRatio: 0.6, totalViolenceEvents: 8, attackFirstEvents: 5 },
      socialApproach: 'helpful',
    });
    const result = narrator.narrate([makeEvent()], patterns);
    expect(result.bias).toBe('mocking');
  });

  it('selects tragic bias for consistently dark players', () => {
    const narrator = new ChronicleNarrator({ dynamicBias: true });
    const patterns = makePatterns({
      ratios: { mercyVsViolence: -0.7, honestyVsDeception: -0.5, helpfulVsHarmful: -0.5 },
      dominantTraits: ['ruthless', 'deceptive'],
      socialApproach: 'hostile',
    });
    const result = narrator.narrate([makeEvent()], patterns);
    expect(result.bias).toBe('tragic');
  });

  it('uses default bias when dynamic is disabled', () => {
    const narrator = new ChronicleNarrator({ dynamicBias: false, defaultBias: 'mocking' });
    const result = narrator.narrate([makeEvent()], makePatterns());
    expect(result.bias).toBe('mocking');
  });

  it('calculates positive reputation for mercy events', () => {
    const narrator = new ChronicleNarrator({ defaultBias: 'detached', dynamicBias: false });
    const events = [
      makeEvent({ id: 'e1', action: 'spare_enemy' }),
      makeEvent({ id: 'e2', action: 'show_mercy' }),
      makeEvent({ id: 'e3', action: 'help' }),
    ];
    const result = narrator.narrate(events);
    expect(result.reputationImpact).toBeGreaterThan(0);
  });

  it('calculates negative reputation for violence events', () => {
    const narrator = new ChronicleNarrator({ defaultBias: 'detached', dynamicBias: false });
    const events = [
      makeEvent({ id: 'e1', action: 'kill' }),
      makeEvent({ id: 'e2', action: 'torture' }),
      makeEvent({ id: 'e3', action: 'attack_first' }),
    ];
    const result = narrator.narrate(events);
    expect(result.reputationImpact).toBeLessThan(0);
  });

  it('sympathetic bias softens negative reputation', () => {
    const narrator = new ChronicleNarrator({ defaultBias: 'sympathetic', dynamicBias: false });
    const events = [makeEvent({ id: 'e1', action: 'kill' })];
    const sympatheticResult = narrator.narrate(events);

    const hostileNarrator = new ChronicleNarrator({ defaultBias: 'hostile', dynamicBias: false });
    const hostileResult = hostileNarrator.narrate(events);

    expect(sympatheticResult.reputationImpact).toBeGreaterThan(hostileResult.reputationImpact);
  });

  it('builds chronicle input from narration result', () => {
    const narrator = new ChronicleNarrator();
    const events = [
      makeEvent({ id: 'e1', turn: 3 }),
      makeEvent({ id: 'e2', turn: 7 }),
    ];
    const narration = narrator.narrate(events);
    const input = narrator.buildChronicleInput('game-1', events, narration, 'The chronicle text.');

    expect(input.gameId).toBe('game-1');
    expect(input.turnStart).toBe(3);
    expect(input.turnEnd).toBe(7);
    expect(input.content).toBe('The chronicle text.');
    expect(input.bias).toBe(narration.bias);
    expect(input.sourceEventIds).toEqual(['e1', 'e2']);
  });
});
