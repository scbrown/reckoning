/**
 * EventBuilder Service
 *
 * Constructs structured events from AI-generated content.
 * Extracts actors, targets, witnesses, and tags from AI metadata or infers them from content.
 */

import type {
  EventType,
  ActorType,
  TargetType,
  GenerationType,
} from '@reckoning/shared';
import {
  type Action,
  getActionCategory,
  isValidAction,
} from '@reckoning/shared';

// =============================================================================
// Types
// =============================================================================

/**
 * Witness reference in structured event data
 */
export interface WitnessRef {
  type: ActorType;
  id: string;
}

/**
 * Target reference in structured event data
 */
export interface TargetRef {
  type: TargetType;
  id: string;
}

/**
 * Actor reference in structured event data
 */
export interface ActorRef {
  type: ActorType;
  id: string;
}

/**
 * AI-provided metadata for structured events
 */
export interface AIStructuredMetadata {
  action?: string;
  actor?: ActorRef;
  targets?: TargetRef[];
  witnesses?: WitnessRef[];
  tags?: string[];
}

/**
 * Parameters for building a structured event from AI generation
 */
export interface BuildFromGenerationParams {
  /** Type of generation (narration, npc_response, etc.) */
  generationType: GenerationType;
  /** Type of event (narration, party_action, etc.) */
  eventType: EventType;
  /** The narrative content generated */
  content: string;
  /** AI-provided structured metadata (if available) */
  metadata?: AIStructuredMetadata;
  /** Speaker for dialogue events */
  speaker?: string;
  /** NPCs present in the current area */
  npcsPresent?: Array<{ id: string; name: string }>;
  /** Characters in the party */
  partyMembers?: Array<{ id: string; name: string }>;
  /** Current location ID */
  locationId?: string;
}

/**
 * Structured event data extracted/inferred from AI generation
 */
export interface StructuredEventData {
  action?: Action | undefined;
  actorType?: ActorType | undefined;
  actorId?: string | undefined;
  targetType?: TargetType | undefined;
  targetId?: string | undefined;
  witnesses: string[];
  tags: string[];
}

// =============================================================================
// EventBuilder Class
// =============================================================================

/**
 * Service for constructing structured events from AI-generated content.
 *
 * Priority for fields:
 * 1. AI-provided metadata (if present)
 * 2. Inference from content (if metadata missing)
 * 3. Default/empty values
 */
export class EventBuilder {
  /**
   * Build structured event data from AI generation output.
   *
   * @param params - Parameters including content, metadata, and context
   * @returns Structured event data ready to be merged into a CanonicalEvent
   */
  buildFromGeneration(params: BuildFromGenerationParams): StructuredEventData {
    const {
      generationType,
      eventType,
      content,
      metadata,
      speaker,
      npcsPresent = [],
      partyMembers = [],
    } = params;

    // Determine actor (priority: metadata > inference)
    const actor = metadata?.actor
      ? metadata.actor
      : this.determineActor(generationType, eventType, speaker, partyMembers);

    // Extract targets (priority: metadata > inference)
    const targets = metadata?.targets?.length
      ? metadata.targets
      : this.extractTargets(content, eventType, npcsPresent, partyMembers);

    // Extract action (priority: metadata > inference)
    const action = metadata?.action && isValidAction(metadata.action)
      ? metadata.action as Action
      : this.inferActionFromContent(content, eventType);

    // Extract witnesses (priority: metadata > inference)
    const witnesses = metadata?.witnesses?.length
      ? metadata.witnesses.map(w => w.id)
      : this.extractWitnesses(content, actor, targets, npcsPresent, partyMembers);

    // Generate tags (combines metadata tags with auto-generated)
    const baseTags = metadata?.tags ?? [];
    const autoTags = action ? this.generateTags(action, content, eventType) : [];
    const tags = [...new Set([...baseTags, ...autoTags])];

    return {
      action,
      actorType: actor?.type,
      actorId: actor?.id,
      targetType: targets[0]?.type,
      targetId: targets[0]?.id,
      witnesses,
      tags,
    };
  }

  /**
   * Determine the actor based on generation type and available context.
   *
   * @param generationType - Type of content generation
   * @param eventType - Type of event
   * @param speaker - Speaker name (for dialogue events)
   * @param partyMembers - Party members for matching
   * @returns Actor reference or undefined
   */
  determineActor(
    generationType: GenerationType,
    eventType: EventType,
    speaker?: string,
    partyMembers: Array<{ id: string; name: string }> = []
  ): ActorRef | undefined {
    // For NPC responses, the actor is the NPC
    if (generationType === 'npc_response' || eventType === 'npc_dialogue' || eventType === 'npc_action') {
      if (speaker) {
        return { type: 'npc', id: this.normalizeId(speaker) };
      }
      return { type: 'npc', id: 'unknown' };
    }

    // For party actions/dialogue, the actor is the player or a party member
    if (eventType === 'party_action' || eventType === 'party_dialogue') {
      if (speaker) {
        // Check if speaker matches a party member
        const member = partyMembers.find(
          m => m.name.toLowerCase() === speaker.toLowerCase()
        );
        if (member) {
          return { type: 'character', id: member.id };
        }
      }
      // Default to player for party actions
      return { type: 'player', id: 'player' };
    }

    // For narration/environment, actor is system
    if (eventType === 'narration' || eventType === 'environment') {
      return { type: 'system', id: 'narrator' };
    }

    // For DM injection, actor is system (DM)
    if (eventType === 'dm_injection') {
      return { type: 'system', id: 'dm' };
    }

    return undefined;
  }

  /**
   * Extract targets from content or metadata.
   *
   * @param content - Narrative content to analyze
   * @param eventType - Type of event
   * @param npcsPresent - NPCs in the area
   * @param partyMembers - Party members
   * @returns Array of target references
   */
  extractTargets(
    content: string,
    eventType: EventType,
    npcsPresent: Array<{ id: string; name: string }> = [],
    partyMembers: Array<{ id: string; name: string }> = []
  ): TargetRef[] {
    const targets: TargetRef[] = [];
    const contentLower = content.toLowerCase();

    // For NPC actions/dialogue directed at party
    if (eventType === 'npc_action' || eventType === 'npc_dialogue') {
      // Check if any party member is mentioned
      for (const member of partyMembers) {
        if (contentLower.includes(member.name.toLowerCase())) {
          targets.push({ type: 'character', id: member.id });
        }
      }
      // If content mentions "you" or party-related terms, target the player
      if (this.mentionsPlayer(content)) {
        targets.push({ type: 'player', id: 'player' });
      }
    }

    // For party actions, check for NPC targets
    if (eventType === 'party_action' || eventType === 'party_dialogue') {
      for (const npc of npcsPresent) {
        if (contentLower.includes(npc.name.toLowerCase())) {
          targets.push({ type: 'npc', id: npc.id });
        }
      }
    }

    return targets;
  }

  /**
   * Extract witnesses from content, excluding actor and targets.
   *
   * @param content - Narrative content
   * @param actor - The acting entity
   * @param targets - Target entities
   * @param npcsPresent - NPCs in the area
   * @param partyMembers - Party members
   * @returns Array of witness entity IDs
   */
  extractWitnesses(
    content: string,
    actor: ActorRef | undefined,
    targets: TargetRef[],
    npcsPresent: Array<{ id: string; name: string }> = [],
    partyMembers: Array<{ id: string; name: string }> = []
  ): string[] {
    const witnesses: string[] = [];
    const excludeIds = new Set<string>();

    // Exclude actor and targets from witnesses
    if (actor?.id) {
      excludeIds.add(actor.id);
    }
    for (const target of targets) {
      excludeIds.add(target.id);
    }

    const contentLower = content.toLowerCase();

    // Add mentioned NPCs as witnesses (if not actor/target)
    for (const npc of npcsPresent) {
      if (!excludeIds.has(npc.id) && contentLower.includes(npc.name.toLowerCase())) {
        witnesses.push(npc.id);
      }
    }

    // Add mentioned party members as witnesses (if not actor/target)
    for (const member of partyMembers) {
      if (!excludeIds.has(member.id) && contentLower.includes(member.name.toLowerCase())) {
        witnesses.push(member.id);
      }
    }

    // If no specific witnesses found but event is public, add all present NPCs
    if (witnesses.length === 0 && this.isPublicEvent(content)) {
      for (const npc of npcsPresent) {
        if (!excludeIds.has(npc.id)) {
          witnesses.push(npc.id);
        }
      }
    }

    return [...new Set(witnesses)];
  }

  /**
   * Generate tags based on action and content.
   *
   * @param action - The action verb
   * @param content - Narrative content
   * @param eventType - Type of event
   * @returns Array of tags
   */
  generateTags(action: Action, content: string, eventType: EventType): string[] {
    const tags: string[] = [];

    // Add action category as tag
    const category = getActionCategory(action);
    if (category) {
      tags.push(category);
    }

    // Add specific action as tag
    tags.push(action);

    // Add event type as tag
    tags.push(eventType);

    // Add contextual tags based on content analysis
    const contentLower = content.toLowerCase();

    // Combat-related tags
    if (this.matchesPatterns(contentLower, ['battle', 'fight', 'combat', 'attack', 'defend', 'sword', 'weapon'])) {
      tags.push('combat');
    }

    // Social interaction tags
    if (this.matchesPatterns(contentLower, ['conversation', 'spoke', 'said', 'asked', 'replied', 'negotiate'])) {
      tags.push('dialogue');
    }

    // Discovery/exploration tags
    if (this.matchesPatterns(contentLower, ['found', 'discovered', 'explored', 'noticed', 'spotted', 'revealed'])) {
      tags.push('discovery');
    }

    // Emotional tags
    if (this.matchesPatterns(contentLower, ['angry', 'furious', 'rage'])) {
      tags.push('emotional:anger');
    }
    if (this.matchesPatterns(contentLower, ['sad', 'grief', 'mourning', 'tears'])) {
      tags.push('emotional:sadness');
    }
    if (this.matchesPatterns(contentLower, ['happy', 'joy', 'celebrate', 'pleased'])) {
      tags.push('emotional:joy');
    }
    if (this.matchesPatterns(contentLower, ['fear', 'afraid', 'terrified', 'scared'])) {
      tags.push('emotional:fear');
    }

    return [...new Set(tags)];
  }

  /**
   * Infer action from content when not provided by AI.
   * Uses pattern matching to identify the most likely action.
   */
  private inferActionFromContent(content: string, _eventType: EventType): Action | undefined {
    const contentLower = content.toLowerCase();

    // Violence patterns
    if (this.matchesPatterns(contentLower, ['killed', 'slew', 'slain', 'struck down', 'murdered'])) {
      return 'kill';
    }
    if (this.matchesPatterns(contentLower, ['executed', 'execution'])) {
      return 'execute';
    }
    if (this.matchesPatterns(contentLower, ['attacked first', 'initiated attack', 'struck first', 'lunged at'])) {
      return 'attack_first';
    }
    if (this.matchesPatterns(contentLower, ['threaten', 'threatens', 'threatened', 'menaced', 'intimidated'])) {
      return 'threaten';
    }
    if (this.matchesPatterns(contentLower, ['tortured', 'tormented'])) {
      return 'torture';
    }

    // Mercy patterns
    if (this.matchesPatterns(contentLower, ['spared', 'let.*go', 'released.*enemy', "didn't kill"])) {
      return 'spare_enemy';
    }
    if (this.matchesPatterns(contentLower, ['showed mercy', 'merciful', 'had mercy'])) {
      return 'show_mercy';
    }
    if (this.matchesPatterns(contentLower, ['forgave', 'forgiven', 'pardoned'])) {
      return 'forgive';
    }
    if (this.matchesPatterns(contentLower, ['healed.*enemy', 'tended.*wounds'])) {
      return 'heal_enemy';
    }
    if (this.matchesPatterns(contentLower, ['released.*prisoner', 'freed.*captive', 'unlocked.*cell'])) {
      return 'release_prisoner';
    }

    // Honesty patterns
    if (this.matchesPatterns(contentLower, ['told the truth', 'spoke honestly', 'truthfully'])) {
      return 'tell_truth';
    }
    if (this.matchesPatterns(contentLower, ['confessed', 'admitted'])) {
      return 'confess';
    }
    if (this.matchesPatterns(contentLower, ['revealed.*secret', 'disclosed'])) {
      return 'reveal_secret';
    }
    if (this.matchesPatterns(contentLower, ['kept.*promise', 'honored.*word'])) {
      return 'keep_promise';
    }
    if (this.matchesPatterns(contentLower, ['lied', 'lying', 'false claim'])) {
      return 'lie';
    }
    if (this.matchesPatterns(contentLower, ['deceived', 'tricked', 'fooled'])) {
      return 'deceive';
    }
    if (this.matchesPatterns(contentLower, ['broke.*promise', 'broken.*word'])) {
      return 'break_promise';
    }
    if (this.matchesPatterns(contentLower, ['withheld', 'kept secret', "didn't mention"])) {
      return 'withhold_info';
    }

    // Social patterns
    if (this.matchesPatterns(contentLower, ['helped', 'assisted', 'aided'])) {
      return 'help';
    }
    if (this.matchesPatterns(contentLower, ['betrayed', 'backstabbed', 'double-crossed'])) {
      return 'betray';
    }
    if (this.matchesPatterns(contentLower, ['befriended', 'made friends', 'bonded with'])) {
      return 'befriend';
    }
    if (this.matchesPatterns(contentLower, ['insulted', 'mocked', 'ridiculed'])) {
      return 'insult';
    }
    if (this.matchesPatterns(contentLower, ['intimidated', 'frightened', 'scared into'])) {
      return 'intimidate';
    }
    if (this.matchesPatterns(contentLower, ['persuaded', 'convinced', 'talked into'])) {
      return 'persuade';
    }
    if (this.matchesPatterns(contentLower, ['bribed', 'paid off', 'offered gold'])) {
      return 'bribe';
    }

    // Exploration patterns
    if (this.matchesPatterns(contentLower, ['entered', 'stepped into', 'walked into', 'arrived at'])) {
      return 'enter_location';
    }
    if (this.matchesPatterns(contentLower, ['examined', 'inspected', 'looked closely'])) {
      return 'examine';
    }
    if (this.matchesPatterns(contentLower, ['searched', 'looked for', 'rummaged'])) {
      return 'search';
    }
    if (this.matchesPatterns(contentLower, ['stole', 'pilfered', 'pickpocketed', 'snatched'])) {
      return 'steal';
    }
    if (this.matchesPatterns(contentLower, ['unlocked', 'picked.*lock', 'opened.*door'])) {
      return 'unlock';
    }
    if (this.matchesPatterns(contentLower, ['destroyed', 'smashed', 'broke'])) {
      return 'destroy';
    }

    // Character patterns
    if (this.matchesPatterns(contentLower, ['leveled up', 'gained.*level', 'grew stronger'])) {
      return 'level_up';
    }
    if (this.matchesPatterns(contentLower, ['acquired', 'obtained', 'picked up', 'received'])) {
      return 'acquire_item';
    }
    if (this.matchesPatterns(contentLower, ['used.*ability', 'cast.*spell', 'activated'])) {
      return 'use_ability';
    }
    if (this.matchesPatterns(contentLower, ['rested', 'slept', 'made camp'])) {
      return 'rest';
    }
    if (this.matchesPatterns(contentLower, ['prayed', 'knelt.*altar', 'offered.*prayer'])) {
      return 'pray';
    }
    if (this.matchesPatterns(contentLower, ['meditated', 'focused.*mind', 'centered'])) {
      return 'meditate';
    }

    return undefined;
  }

  /**
   * Check if content matches any of the given patterns.
   */
  private matchesPatterns(content: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(content)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if content mentions the player directly.
   */
  private mentionsPlayer(content: string): boolean {
    const playerPatterns = [
      '\\byou\\b',
      '\\byour\\b',
      '\\bparty\\b',
      '\\badventurers\\b',
      '\\bheroes\\b',
    ];
    return this.matchesPatterns(content.toLowerCase(), playerPatterns);
  }

  /**
   * Check if the event seems to be public (witnessed by others).
   */
  private isPublicEvent(content: string): boolean {
    const publicPatterns = [
      'loudly',
      'shouted',
      'announced',
      'in front of',
      'publicly',
      'for all to see',
      'witnessed',
      'watched',
      'crowd',
      'gathered',
    ];
    return this.matchesPatterns(content.toLowerCase(), publicPatterns);
  }

  /**
   * Normalize a name to an ID format.
   */
  private normalizeId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }
}
