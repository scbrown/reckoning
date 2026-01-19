import { describe, it, expect, beforeEach } from 'vitest';
import { EventBuilder } from '../event-builder.js';
import type {
  BuildFromGenerationParams,
  AIStructuredMetadata,
} from '../event-builder.js';

describe('EventBuilder', () => {
  let builder: EventBuilder;

  beforeEach(() => {
    builder = new EventBuilder();
  });

  describe('buildFromGeneration', () => {
    it('should use AI-provided metadata when available', () => {
      const params: BuildFromGenerationParams = {
        generationType: 'narration',
        eventType: 'party_action',
        content: 'The party attacks the goblin.',
        metadata: {
          action: 'attack_first',
          actor: { type: 'player', id: 'player' },
          targets: [{ type: 'npc', id: 'goblin_1' }],
          witnesses: [{ type: 'npc', id: 'goblin_2' }],
          tags: ['combat', 'initiative'],
        },
      };

      const result = builder.buildFromGeneration(params);

      expect(result.action).toBe('attack_first');
      expect(result.actorType).toBe('player');
      expect(result.actorId).toBe('player');
      expect(result.targetType).toBe('npc');
      expect(result.targetId).toBe('goblin_1');
      expect(result.witnesses).toContain('goblin_2');
      expect(result.tags).toContain('combat');
      expect(result.tags).toContain('initiative');
    });

    it('should infer data when metadata is missing', () => {
      const params: BuildFromGenerationParams = {
        generationType: 'narration',
        eventType: 'party_action',
        content: 'The player killed the orc with a mighty blow.',
        npcsPresent: [{ id: 'orc_1', name: 'Orc' }],
      };

      const result = builder.buildFromGeneration(params);

      expect(result.action).toBe('kill');
      expect(result.actorType).toBe('player');
      expect(result.actorId).toBe('player');
      expect(result.tags).toContain('violence');
    });

    it('should handle NPC response generation', () => {
      const params: BuildFromGenerationParams = {
        generationType: 'npc_response',
        eventType: 'npc_dialogue',
        content: 'The guard says "You shall not pass!"',
        speaker: 'Guard Captain',
        partyMembers: [{ id: 'hero_1', name: 'Aldric' }],
      };

      const result = builder.buildFromGeneration(params);

      expect(result.actorType).toBe('npc');
      expect(result.actorId).toBe('guard_captain');
    });
  });

  describe('determineActor', () => {
    it('should return NPC actor for npc_response generation', () => {
      const actor = builder.determineActor('npc_response', 'npc_dialogue', 'Goblin King');

      expect(actor).toEqual({ type: 'npc', id: 'goblin_king' });
    });

    it('should return player actor for party_action events', () => {
      const actor = builder.determineActor('narration', 'party_action');

      expect(actor).toEqual({ type: 'player', id: 'player' });
    });

    it('should match speaker to party member for party_dialogue', () => {
      const partyMembers = [
        { id: 'char_1', name: 'Aldric' },
        { id: 'char_2', name: 'Elena' },
      ];

      const actor = builder.determineActor('narration', 'party_dialogue', 'Elena', partyMembers);

      expect(actor).toEqual({ type: 'character', id: 'char_2' });
    });

    it('should return system actor for narration events', () => {
      const actor = builder.determineActor('narration', 'narration');

      expect(actor).toEqual({ type: 'system', id: 'narrator' });
    });

    it('should return system actor for dm_injection events', () => {
      const actor = builder.determineActor('dm_continuation', 'dm_injection');

      expect(actor).toEqual({ type: 'system', id: 'dm' });
    });
  });

  describe('extractTargets', () => {
    const npcsPresent = [
      { id: 'guard_1', name: 'Guard' },
      { id: 'merchant_1', name: 'Merchant' },
    ];
    const partyMembers = [
      { id: 'hero_1', name: 'Aldric' },
      { id: 'hero_2', name: 'Elena' },
    ];

    it('should extract NPC targets from party_action content', () => {
      const targets = builder.extractTargets(
        'Aldric attacks the Guard with his sword.',
        'party_action',
        npcsPresent,
        partyMembers
      );

      expect(targets).toContainEqual({ type: 'npc', id: 'guard_1' });
    });

    it('should extract party member targets from NPC actions', () => {
      const targets = builder.extractTargets(
        'The Guard lunges at Aldric.',
        'npc_action',
        npcsPresent,
        partyMembers
      );

      expect(targets).toContainEqual({ type: 'character', id: 'hero_1' });
    });

    it('should detect player reference with "you" pronoun', () => {
      const targets = builder.extractTargets(
        'The Guard points his sword at you.',
        'npc_action',
        npcsPresent,
        partyMembers
      );

      expect(targets).toContainEqual({ type: 'player', id: 'player' });
    });

    it('should return empty array when no targets found', () => {
      const targets = builder.extractTargets(
        'The sun sets over the mountains.',
        'narration',
        npcsPresent,
        partyMembers
      );

      expect(targets).toEqual([]);
    });
  });

  describe('extractWitnesses', () => {
    const npcsPresent = [
      { id: 'guard_1', name: 'Guard' },
      { id: 'merchant_1', name: 'Merchant' },
      { id: 'villager_1', name: 'Villager' },
    ];
    const partyMembers = [
      { id: 'hero_1', name: 'Aldric' },
      { id: 'hero_2', name: 'Elena' },
    ];

    it('should exclude actor and targets from witnesses', () => {
      const actor = { type: 'player' as const, id: 'player' };
      const targets = [{ type: 'npc' as const, id: 'guard_1' }];

      const witnesses = builder.extractWitnesses(
        'The player attacks the Guard while the Merchant watches.',
        actor,
        targets,
        npcsPresent,
        partyMembers
      );

      expect(witnesses).toContain('merchant_1');
      expect(witnesses).not.toContain('guard_1');
    });

    it('should add all present NPCs for public events', () => {
      const actor = { type: 'player' as const, id: 'player' };
      const targets: { type: 'npc'; id: string }[] = [];

      const witnesses = builder.extractWitnesses(
        'The player shouted loudly in the square for all to see.',
        actor,
        targets,
        npcsPresent,
        partyMembers
      );

      expect(witnesses).toContain('guard_1');
      expect(witnesses).toContain('merchant_1');
      expect(witnesses).toContain('villager_1');
    });

    it('should detect mentioned party members as witnesses', () => {
      const actor = { type: 'npc' as const, id: 'guard_1' };
      const targets = [{ type: 'character' as const, id: 'hero_1' }];

      const witnesses = builder.extractWitnesses(
        'The Guard attacks Aldric while Elena watches.',
        actor,
        targets,
        npcsPresent,
        partyMembers
      );

      expect(witnesses).toContain('hero_2');
      expect(witnesses).not.toContain('hero_1'); // target excluded
    });
  });

  describe('generateTags', () => {
    it('should include action category as tag', () => {
      const tags = builder.generateTags('spare_enemy', 'The hero spared the goblin.', 'party_action');

      expect(tags).toContain('mercy');
      expect(tags).toContain('spare_enemy');
    });

    it('should include event type as tag', () => {
      const tags = builder.generateTags('help', 'The hero helped the villager.', 'party_action');

      expect(tags).toContain('party_action');
    });

    it('should detect combat context', () => {
      const tags = builder.generateTags('attack_first', 'The battle begins with a fierce attack.', 'party_action');

      expect(tags).toContain('combat');
    });

    it('should detect dialogue context', () => {
      const tags = builder.generateTags('persuade', 'The hero spoke convincingly and persuaded the guard.', 'party_dialogue');

      expect(tags).toContain('dialogue');
    });

    it('should detect emotional context', () => {
      const tags = builder.generateTags('threaten', 'The angry warlord threatened the villagers in a furious rage.', 'npc_action');

      expect(tags).toContain('emotional:anger');
    });

    it('should detect discovery context', () => {
      const tags = builder.generateTags('examine', 'The hero discovered a hidden passage.', 'party_action');

      expect(tags).toContain('discovery');
    });

    it('should deduplicate tags', () => {
      const tags = builder.generateTags('kill', 'The warrior killed the enemy in combat battle.', 'party_action');

      const uniqueTags = [...new Set(tags)];
      expect(tags.length).toBe(uniqueTags.length);
    });
  });

  describe('action inference', () => {
    it('should infer kill action from content', () => {
      const params: BuildFromGenerationParams = {
        generationType: 'narration',
        eventType: 'party_action',
        content: 'With a swift strike, the warrior slew the dragon.',
      };

      const result = builder.buildFromGeneration(params);
      expect(result.action).toBe('kill');
    });

    it('should infer spare_enemy from content', () => {
      const params: BuildFromGenerationParams = {
        generationType: 'narration',
        eventType: 'party_action',
        content: 'The hero spared the defeated bandit and let him go.',
      };

      const result = builder.buildFromGeneration(params);
      expect(result.action).toBe('spare_enemy');
    });

    it('should infer deceive from content', () => {
      const params: BuildFromGenerationParams = {
        generationType: 'narration',
        eventType: 'party_action',
        content: 'The rogue deceived the guard with a clever lie.',
      };

      const result = builder.buildFromGeneration(params);
      expect(result.action).toBe('deceive');
    });

    it('should infer betray from content', () => {
      const params: BuildFromGenerationParams = {
        generationType: 'narration',
        eventType: 'party_action',
        content: 'In a shocking twist, the ally betrayed the party.',
      };

      const result = builder.buildFromGeneration(params);
      expect(result.action).toBe('betray');
    });

    it('should infer enter_location from content', () => {
      const params: BuildFromGenerationParams = {
        generationType: 'narration',
        eventType: 'party_action',
        content: 'The party entered the dark cave.',
      };

      const result = builder.buildFromGeneration(params);
      expect(result.action).toBe('enter_location');
    });

    it('should return undefined when no action can be inferred', () => {
      const params: BuildFromGenerationParams = {
        generationType: 'narration',
        eventType: 'narration',
        content: 'The sun rose over the peaceful valley.',
      };

      const result = builder.buildFromGeneration(params);
      expect(result.action).toBeUndefined();
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete AI metadata with override', () => {
      const params: BuildFromGenerationParams = {
        generationType: 'narration',
        eventType: 'party_action',
        content: 'The hero killed the dragon.',
        metadata: {
          action: 'execute', // Override inferred 'kill'
          actor: { type: 'character', id: 'hero_1' },
          targets: [{ type: 'npc', id: 'dragon_1' }],
          tags: ['boss_fight', 'climax'],
        },
        npcsPresent: [{ id: 'dragon_1', name: 'Dragon' }],
        partyMembers: [{ id: 'hero_1', name: 'Hero' }],
      };

      const result = builder.buildFromGeneration(params);

      // AI metadata takes priority
      expect(result.action).toBe('execute');
      expect(result.actorType).toBe('character');
      expect(result.actorId).toBe('hero_1');
      expect(result.tags).toContain('boss_fight');
      expect(result.tags).toContain('climax');
      // Auto-generated tags added
      expect(result.tags).toContain('violence');
    });

    it('should handle partial AI metadata with inference fallback', () => {
      const params: BuildFromGenerationParams = {
        generationType: 'npc_response',
        eventType: 'npc_dialogue',
        content: 'The Guard threatens you with his spear.',
        metadata: {
          tags: ['hostile'],
        },
        speaker: 'Guard',
        npcsPresent: [{ id: 'guard_1', name: 'Guard' }],
      };

      const result = builder.buildFromGeneration(params);

      // Inferred from content/context
      expect(result.action).toBe('threaten');
      expect(result.actorType).toBe('npc');
      expect(result.actorId).toBe('guard');
      // Player targeted (detected from "you")
      expect(result.targetType).toBe('player');
      // Combined tags
      expect(result.tags).toContain('hostile');
      expect(result.tags).toContain('violence');
    });
  });
});
