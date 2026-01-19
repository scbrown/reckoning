import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActionClassifier } from '../action-classifier.js';
import type { ClassificationResult } from '../types.js';

// =============================================================================
// Test Setup
// =============================================================================

describe('ActionClassifier', () => {
  let classifier: ActionClassifier;

  beforeEach(() => {
    classifier = new ActionClassifier();
  });

  // ===========================================================================
  // Mercy Pattern Tests
  // ===========================================================================

  describe('matchesMercyPatterns', () => {
    it('should match spare_enemy patterns', () => {
      const testCases = [
        'You spared the fallen guard',
        'The hero spares the enemy soldier',
        'He let him go with a warning',
        'She lets her live despite everything',
        'You lower your sword and step back',
        'He refused to kill the defenseless creature',
        'She stayed her hand at the last moment',
      ];

      for (const content of testCases) {
        const result = classifier.matchesMercyPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('spare_enemy');
      }
    });

    it('should match show_mercy patterns', () => {
      const testCases = [
        'You show mercy to the wounded',
        'She showed great compassion',
        'He acted mercifully toward the prisoners',
        'They took pity on the starving child',
      ];

      for (const content of testCases) {
        const result = classifier.matchesMercyPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('show_mercy');
      }
    });

    it('should match forgive patterns', () => {
      const testCases = [
        'You forgive him for his betrayal',
        'She forgave the thief',
        'He pardoned the prisoner',
      ];

      for (const content of testCases) {
        const result = classifier.matchesMercyPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('forgive');
      }
    });

    it('should match heal_enemy patterns', () => {
      const testCases = [
        'You heal the wounded enemy',
        'She tends to the fallen foe',
        'He bandaged the enemy soldier',
      ];

      for (const content of testCases) {
        const result = classifier.matchesMercyPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('heal_enemy');
      }
    });

    it('should match release_prisoner patterns', () => {
      const testCases = [
        'You release the prisoner from the dungeon',
        'She freed the captive',
        'He unlocked the cell and let them out',
        'They set the hostage free',
      ];

      for (const content of testCases) {
        const result = classifier.matchesMercyPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('release_prisoner');
      }
    });
  });

  // ===========================================================================
  // Violence Pattern Tests
  // ===========================================================================

  describe('matchesViolencePatterns', () => {
    it('should match kill patterns', () => {
      const testCases = [
        'You killed the bandit',
        'She slays the dragon',
        'He slew the beast',
        'The arrow struck down the guard',
        'She ended his life with a single blow',
      ];

      for (const content of testCases) {
        const result = classifier.matchesViolencePatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('kill');
      }
    });

    it('should match execute patterns', () => {
      const testCases = [
        'The king ordered his execution',
        'She executed the traitor',
        'He beheaded the criminal',
        'You finished him off without hesitation',
      ];

      for (const content of testCases) {
        const result = classifier.matchesViolencePatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('execute');
      }
    });

    it('should match attack_first patterns', () => {
      const testCases = [
        'You attacked first without warning',
        'She strikes before they can react',
        'He initiated the attack',
        'They charged at the unsuspecting guards',
      ];

      for (const content of testCases) {
        const result = classifier.matchesViolencePatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('attack_first');
      }
    });

    it('should match threaten patterns', () => {
      const testCases = [
        'You threaten the merchant',
        'She pointed her sword at the innkeeper',
        'He intimidated the guard into submission',
      ];

      for (const content of testCases) {
        const result = classifier.matchesViolencePatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('threaten');
      }
    });

    it('should match torture patterns', () => {
      const testCases = [
        'You tortured the prisoner for information',
        'She tormented him until he talked',
        'He inflicted pain to make him confess',
        'They made her suffer for hours',
      ];

      for (const content of testCases) {
        const result = classifier.matchesViolencePatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('torture');
      }
    });
  });

  // ===========================================================================
  // Honesty Pattern Tests
  // ===========================================================================

  describe('matchesHonestyPatterns', () => {
    it('should match tell_truth patterns', () => {
      const testCases = [
        'You tell the truth about what happened',
        'She honestly admitted her role',
        'He speaks truthfully to the council',
      ];

      for (const content of testCases) {
        const result = classifier.matchesHonestyPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('tell_truth');
      }
    });

    it('should match confess patterns', () => {
      const testCases = [
        'You confess to the crime',
        'She admitted to her wrongdoing',
        'He came clean about everything',
      ];

      for (const content of testCases) {
        const result = classifier.matchesHonestyPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('confess');
      }
    });

    it('should match lie patterns', () => {
      const testCases = [
        'You lied to the guard',
        'She told a lie about her whereabouts',
        'He speaks falsely to the court',
      ];

      for (const content of testCases) {
        const result = classifier.matchesHonestyPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('lie');
      }
    });

    it('should match deceive patterns', () => {
      const testCases = [
        'You deceived the merchant',
        'She tricked him into signing',
        'He fooled the guards with his disguise',
        'They misled the investigators',
      ];

      for (const content of testCases) {
        const result = classifier.matchesHonestyPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('deceive');
      }
    });

    it('should match keep_promise patterns', () => {
      const testCases = [
        'You kept your promise to return',
        'She honored her word',
        'He remained true to his word',
      ];

      for (const content of testCases) {
        const result = classifier.matchesHonestyPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('keep_promise');
      }
    });

    it('should match break_promise patterns', () => {
      const testCases = [
        'You broke your promise',
        'She betrayed their trust',
        'He went back on his word',
      ];

      for (const content of testCases) {
        const result = classifier.matchesHonestyPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('break_promise');
      }
    });
  });

  // ===========================================================================
  // Social Pattern Tests
  // ===========================================================================

  describe('matchesSocialPatterns', () => {
    it('should match help patterns', () => {
      const testCases = [
        'You helped the old man',
        'She assisted the wounded traveler',
        'He came to the aid of the villagers',
        'They lent a hand to the farmers',
      ];

      for (const content of testCases) {
        const result = classifier.matchesSocialPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('help');
      }
    });

    it('should match betray patterns', () => {
      const testCases = [
        'You betrayed your companions',
        'She stabbed him in the back',
        'He turned on his ally without warning',
      ];

      for (const content of testCases) {
        const result = classifier.matchesSocialPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('betray');
      }
    });

    it('should match befriend patterns', () => {
      const testCases = [
        'You befriended the lonely scholar',
        'They became friends over time',
        'She extended the hand of friendship',
      ];

      for (const content of testCases) {
        const result = classifier.matchesSocialPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('befriend');
      }
    });

    it('should match insult patterns', () => {
      const testCases = [
        'You insulted the noble',
        'She mocked his efforts',
        'He hurled an insult at the guard',
      ];

      for (const content of testCases) {
        const result = classifier.matchesSocialPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('insult');
      }
    });

    it('should match persuade patterns', () => {
      const testCases = [
        'You persuaded the merchant',
        'She convinced him to help',
        'He talked her into joining',
      ];

      for (const content of testCases) {
        const result = classifier.matchesSocialPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('persuade');
      }
    });

    it('should match bribe patterns', () => {
      const testCases = [
        'You bribed the guard',
        'She offered gold for passage',
        'He greased the palm of the official',
      ];

      for (const content of testCases) {
        const result = classifier.matchesSocialPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('bribe');
      }
    });
  });

  // ===========================================================================
  // Exploration Pattern Tests
  // ===========================================================================

  describe('matchesExplorationPatterns', () => {
    it('should match enter_location patterns', () => {
      const testCases = [
        'You entered the dark cave',
        'She arrived at the village',
        'He stepped into the throne room',
      ];

      for (const content of testCases) {
        const result = classifier.matchesExplorationPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('enter_location');
      }
    });

    it('should match examine patterns', () => {
      const testCases = [
        'You examined the ancient tome',
        'She inspected the strange markings',
        'He looked closely at the inscription',
      ];

      for (const content of testCases) {
        const result = classifier.matchesExplorationPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('examine');
      }
    });

    it('should match search patterns', () => {
      const testCases = [
        'You searched the room',
        'She rummaged through the drawers',
        'He looked around for clues',
      ];

      for (const content of testCases) {
        const result = classifier.matchesExplorationPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('search');
      }
    });

    it('should match steal patterns', () => {
      const testCases = [
        'You stole the amulet',
        'She picked his pocket',
        'He pilfered the documents',
        'They took the gold without permission',
      ];

      for (const content of testCases) {
        const result = classifier.matchesExplorationPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('steal');
      }
    });

    it('should match unlock patterns', () => {
      const testCases = [
        'You unlocked the door',
        'She picked the lock',
        'He used the key to open the chest',
      ];

      for (const content of testCases) {
        const result = classifier.matchesExplorationPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('unlock');
      }
    });

    it('should match destroy patterns', () => {
      const testCases = [
        'You destroyed the cursed artifact',
        'She smashed the crystal',
        'He broke through the barrier',
        'They demolished the wall',
      ];

      for (const content of testCases) {
        const result = classifier.matchesExplorationPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('destroy');
      }
    });
  });

  // ===========================================================================
  // Character Pattern Tests
  // ===========================================================================

  describe('matchesCharacterPatterns', () => {
    it('should match level_up patterns', () => {
      const testCases = [
        'You leveled up from the experience',
        'She gained a level',
        'He grew stronger from the ordeal',
      ];

      for (const content of testCases) {
        const result = classifier.matchesCharacterPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('level_up');
      }
    });

    it('should match acquire_item patterns', () => {
      const testCases = [
        'You acquired a new weapon',
        'She obtained the legendary sword',
        'He picked up the enchanted staff',
        'You added the potion to your inventory',
      ];

      for (const content of testCases) {
        const result = classifier.matchesCharacterPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('acquire_item');
      }
    });

    it('should match use_ability patterns', () => {
      const testCases = [
        'You used your healing ability',
        'She cast a powerful spell',
        'He invoked his divine power',
        'You channeled your energy',
      ];

      for (const content of testCases) {
        const result = classifier.matchesCharacterPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('use_ability');
      }
    });

    it('should match rest patterns', () => {
      const testCases = [
        'You rested at the inn',
        'The party made camp for the night',
        'She took a short rest',
        'He slept until dawn',
      ];

      for (const content of testCases) {
        const result = classifier.matchesCharacterPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('rest');
      }
    });

    it('should match pray patterns', () => {
      const testCases = [
        'You prayed to the gods',
        'She offered a prayer',
        'He kneeled in prayer at the shrine',
      ];

      for (const content of testCases) {
        const result = classifier.matchesCharacterPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('pray');
      }
    });

    it('should match meditate patterns', () => {
      const testCases = [
        'You meditated in the garden',
        'She entered a deep trance',
        'He focused his mind on the task',
      ];

      for (const content of testCases) {
        const result = classifier.matchesCharacterPatterns(content);
        expect(result, `Failed for: "${content}"`).toBeDefined();
        expect(result?.action).toBe('meditate');
      }
    });
  });

  // ===========================================================================
  // Main Classify Method Tests
  // ===========================================================================

  describe('classify', () => {
    it('should return correct classification for clear content', () => {
      const result = classifier.classify('You spared the defeated bandit');

      expect(result.action).toBe('spare_enemy');
      expect(result.category).toBe('mercy');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.usedAiFallback).toBe(false);
    });

    it('should return highest confidence match when multiple patterns match', () => {
      // "helped the enemy" could match help (social) or be interpreted differently
      const result = classifier.classify('You helped the wounded villager');

      expect(result.action).toBe('help');
      expect(result.category).toBe('social');
    });

    it('should return undefined action for unclear content', () => {
      const result = classifier.classify('The sun set behind the mountains');

      expect(result.action).toBeUndefined();
      expect(result.category).toBeUndefined();
      expect(result.confidence).toBeLessThan(0.7);
      expect(result.usedAiFallback).toBe(false);
    });

    it('should handle empty content', () => {
      const result = classifier.classify('');

      expect(result.action).toBeUndefined();
      expect(result.confidence).toBe(0);
    });

    it('should be case insensitive', () => {
      const lowerResult = classifier.classify('you killed the dragon');
      const upperResult = classifier.classify('YOU KILLED THE DRAGON');
      const mixedResult = classifier.classify('You Killed The Dragon');

      expect(lowerResult.action).toBe('kill');
      expect(upperResult.action).toBe('kill');
      expect(mixedResult.action).toBe('kill');
    });
  });

  // ===========================================================================
  // Configuration Tests
  // ===========================================================================

  describe('configuration', () => {
    it('should respect custom minRuleConfidence', () => {
      const strictClassifier = new ActionClassifier({ minRuleConfidence: 0.95 });

      // A lower confidence match should not pass the threshold
      const result = strictClassifier.classify('He let it go'); // "forgive" pattern with 0.6 confidence

      // This pattern has 0.6 confidence, below 0.95
      expect(result.action).toBeUndefined();
    });

    it('should respect enableAiFallback setting', () => {
      const noFallbackClassifier = new ActionClassifier({ enableAiFallback: false });

      // Calling classifyWithFallback should not use AI
      const result = noFallbackClassifier.classify('Something completely unclear');

      expect(result.usedAiFallback).toBe(false);
      expect(result.action).toBeUndefined();
    });
  });

  // ===========================================================================
  // Performance Tests
  // ===========================================================================

  describe('performance', () => {
    it('should classify quickly (< 5ms for rule-based)', () => {
      const content = 'The hero spared the fallen guard and showed great mercy';

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        classifier.classify(content);
      }
      const elapsed = performance.now() - start;

      const avgTime = elapsed / 100;
      expect(avgTime).toBeLessThan(5); // Should be much faster than this
    });

    it('should handle long content efficiently', () => {
      const longContent = `
        The battle raged for hours. Finally, the hero stood over the fallen enemy.
        Blood dripped from his sword, but something stayed his hand.
        Looking into the eyes of his defeated foe, he saw not hatred but fear.
        In that moment, the hero chose mercy. He spared the enemy and let him go.
        The guard would live to see another day.
      `;

      const start = performance.now();
      const result = classifier.classify(longContent);
      const elapsed = performance.now() - start;

      expect(result.action).toBe('spare_enemy');
      expect(elapsed).toBeLessThan(10);
    });
  });

  // ===========================================================================
  // Edge Case Tests
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle special characters', () => {
      const result = classifier.classify("You killed the dragon's minion!");

      expect(result.action).toBe('kill');
    });

    it('should handle multiple actions in content', () => {
      // When multiple actions are present, should return highest confidence
      const content = 'You killed the bandit, then searched the body';
      const result = classifier.classify(content);

      // Both kill and search match, should pick one
      expect(['kill', 'search']).toContain(result.action);
    });

    it('should not match partial words', () => {
      // "killed" should not match in "unskilled"
      const result = classifier.classify('The unskilled worker tried again');

      expect(result.action).not.toBe('kill');
    });

    it('should handle negations appropriately', () => {
      // Note: Simple regex doesn't handle negation well
      // This tests current behavior - patterns match even with negation
      const result = classifier.classify('You did not kill the guard');

      // Current implementation will still match "kill"
      // This is a known limitation of rule-based classification
      expect(result.action).toBe('kill');
    });
  });
});
