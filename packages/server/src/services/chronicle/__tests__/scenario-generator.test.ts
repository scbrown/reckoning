import { describe, it, expect } from 'vitest';
import { ScenarioGenerator } from '../scenario-generator.js';
import type { PlayerPatterns } from '../types.js';

function makePatterns(overrides: Partial<PlayerPatterns> = {}): PlayerPatterns {
  return {
    playerId: 'player-1',
    gameId: 'game-1',
    totalEvents: 20,
    categoryCounts: {
      mercy: 5,
      violence: 2,
      honesty: 4,
      social: 5,
      exploration: 3,
      character: 1,
    },
    ratios: {
      mercyVsViolence: 0.6,
      honestyVsDeception: 0.3,
      helpfulVsHarmful: 0.0,
    },
    violenceInitiation: {
      initiatesViolence: false,
      initiationRatio: 0.1,
      totalViolenceEvents: 2,
      attackFirstEvents: 0,
    },
    socialApproach: 'diplomatic',
    dominantTraits: ['merciful', 'charismatic'],
    ...overrides,
  };
}

describe('ScenarioGenerator', () => {
  it('returns empty result when insufficient events', () => {
    const gen = new ScenarioGenerator();
    const patterns = makePatterns({ totalEvents: 3 });
    const result = gen.generateScenario(patterns);

    expect(result.directives).toHaveLength(0);
    expect(result.formatted).toBe('');
    expect(result.playerId).toBe('player-1');
    expect(result.gameId).toBe('game-1');
  });

  it('generates directives for strong mercy pattern', () => {
    const gen = new ScenarioGenerator();
    const patterns = makePatterns({
      ratios: {
        mercyVsViolence: 0.8,
        honestyVsDeception: 0.1,
        helpfulVsHarmful: 0.0,
      },
    });
    const result = gen.generateScenario(patterns);

    expect(result.directives.length).toBeGreaterThan(0);
    const mercyDirective = result.directives.find(d => d.axis === 'mercy_violence');
    expect(mercyDirective).toBeDefined();
    expect(mercyDirective!.patternValue).toBe('merciful');
    expect(mercyDirective!.confidence).toBe(0.8);
  });

  it('generates directives for violent pattern', () => {
    const gen = new ScenarioGenerator();
    const patterns = makePatterns({
      ratios: {
        mercyVsViolence: -0.7,
        honestyVsDeception: -0.6,
        helpfulVsHarmful: -0.5,
      },
      violenceInitiation: {
        initiatesViolence: true,
        initiationRatio: 0.65,
        totalViolenceEvents: 10,
        attackFirstEvents: 6,
      },
      socialApproach: 'hostile',
    });
    const result = gen.generateScenario(patterns);

    expect(result.directives.length).toBeGreaterThan(0);
    // Should target the strongest patterns
    const axes = result.directives.map(d => d.axis);
    expect(axes).toContain('mercy_violence');
  });

  it('respects maxDirectives configuration', () => {
    const gen = new ScenarioGenerator({ maxDirectives: 1 });
    const patterns = makePatterns({
      ratios: {
        mercyVsViolence: 0.8,
        honestyVsDeception: 0.8,
        helpfulVsHarmful: 0.8,
      },
      socialApproach: 'helpful',
    });
    const result = gen.generateScenario(patterns);

    expect(result.directives.length).toBeLessThanOrEqual(1);
  });

  it('formats directives as human-readable string', () => {
    const gen = new ScenarioGenerator();
    const patterns = makePatterns({
      ratios: {
        mercyVsViolence: 0.9,
        honestyVsDeception: 0.1,
        helpfulVsHarmful: 0.0,
      },
    });
    const result = gen.generateScenario(patterns);

    if (result.directives.length > 0) {
      expect(result.formatted).toContain('Scenario directives');
      expect(result.formatted).toContain('[');
      expect(result.formatted).toContain('subtly influence');
    }
  });

  it('selects different strategies across multiple generations', () => {
    const gen = new ScenarioGenerator();
    const patterns = makePatterns({
      ratios: {
        mercyVsViolence: 0.8,
        honestyVsDeception: 0.1,
        helpfulVsHarmful: 0.0,
      },
    });

    const strategies = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const result = gen.generateScenario(patterns);
      for (const d of result.directives) {
        strategies.add(d.strategy);
      }
    }

    // Should have variety across 10 generations
    expect(strategies.size).toBeGreaterThan(1);
  });

  it('detects deceptive pattern', () => {
    const gen = new ScenarioGenerator();
    const patterns = makePatterns({
      ratios: {
        mercyVsViolence: 0.0,
        honestyVsDeception: -0.7,
        helpfulVsHarmful: 0.0,
      },
      socialApproach: 'manipulative',
    });
    const result = gen.generateScenario(patterns);

    const deceptionDirective = result.directives.find(
      d => d.axis === 'honesty_deception'
    );
    expect(deceptionDirective).toBeDefined();
    expect(deceptionDirective!.patternValue).toBe('deceptive');
  });

  it('detects violence initiator pattern', () => {
    const gen = new ScenarioGenerator();
    const patterns = makePatterns({
      ratios: {
        mercyVsViolence: -0.5,
        honestyVsDeception: 0.0,
        helpfulVsHarmful: 0.0,
      },
      violenceInitiation: {
        initiatesViolence: true,
        initiationRatio: 0.7,
        totalViolenceEvents: 8,
        attackFirstEvents: 5,
      },
    });
    const result = gen.generateScenario(patterns);

    const violenceDirective = result.directives.find(
      d => d.axis === 'violence_initiation'
    );
    expect(violenceDirective).toBeDefined();
    expect(violenceDirective!.patternValue).toBe('initiator');
  });

  it('detects defensive violence pattern', () => {
    const gen = new ScenarioGenerator();
    const patterns = makePatterns({
      ratios: {
        mercyVsViolence: 0.0,
        honestyVsDeception: 0.0,
        helpfulVsHarmful: 0.0,
      },
      violenceInitiation: {
        initiatesViolence: false,
        initiationRatio: 0.1,
        totalViolenceEvents: 5,
        attackFirstEvents: 0,
      },
      socialApproach: 'minimal',
    });
    const result = gen.generateScenario(patterns);

    const violenceDirective = result.directives.find(
      d => d.axis === 'violence_initiation'
    );
    expect(violenceDirective).toBeDefined();
    expect(violenceDirective!.patternValue).toBe('defensive');
  });

  it('ignores weak patterns below threshold', () => {
    const gen = new ScenarioGenerator();
    const patterns = makePatterns({
      ratios: {
        mercyVsViolence: 0.2,  // Below 0.3 threshold
        honestyVsDeception: 0.1,
        helpfulVsHarmful: 0.15,
      },
      violenceInitiation: {
        initiatesViolence: false,
        initiationRatio: 0.3,
        totalViolenceEvents: 1,
        attackFirstEvents: 0,
      },
      socialApproach: 'balanced',
    });
    const result = gen.generateScenario(patterns);

    // No strong patterns = no directives
    expect(result.directives).toHaveLength(0);
  });

  it('configurable challenge rate', () => {
    // With 100% challenge rate, should mostly challenge
    const gen = new ScenarioGenerator({ challengeRate: 1.0 });
    const patterns = makePatterns({
      ratios: {
        mercyVsViolence: 0.9,
        honestyVsDeception: 0.1,
        helpfulVsHarmful: 0.0,
      },
    });

    let challengeCount = 0;
    for (let i = 0; i < 20; i++) {
      const result = gen.generateScenario(patterns);
      for (const d of result.directives) {
        if (d.strategy === 'challenge') challengeCount++;
      }
    }

    // With high challenge rate, should get at least some challenges
    expect(challengeCount).toBeGreaterThan(0);
  });

  it('sets dmOverridden to false by default', () => {
    const gen = new ScenarioGenerator();
    const patterns = makePatterns();
    const result = gen.generateScenario(patterns);
    expect(result.dmOverridden).toBe(false);
  });

  it('handles custom minEventsForScenarios', () => {
    const gen = new ScenarioGenerator({ minEventsForScenarios: 50 });
    const patterns = makePatterns({ totalEvents: 30 });
    const result = gen.generateScenario(patterns);
    expect(result.directives).toHaveLength(0);
  });
});
