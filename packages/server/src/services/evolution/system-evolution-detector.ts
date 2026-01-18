/**
 * System Evolution Detector
 *
 * Rules-based evolution detection that suggests evolutions based on game events
 * without AI input. Detects trait suggestions from repeated actions and
 * relationship changes from event targets.
 */

import type { CanonicalEvent } from '@reckoning/shared/game';
import type { EntityType } from '../../db/repositories/relationship-repository.js';
import type { CreateEvolutionInput } from '../../db/repositories/pending-evolution-repository.js';

/**
 * Pattern detection result for trait suggestions
 */
export interface TraitDetection {
  entityType: EntityType;
  entityId: string;
  trait: string;
  reason: string;
}

/**
 * Pattern detection result for relationship changes
 */
export interface RelationshipDetection {
  fromType: EntityType;
  fromId: string;
  toType: EntityType;
  toId: string;
  dimension: 'trust' | 'respect' | 'affection' | 'fear' | 'resentment' | 'debt';
  change: number; // Positive or negative delta
  reason: string;
}

/**
 * Keyword patterns that suggest specific traits
 */
const TRAIT_KEYWORDS: Record<string, string[]> = {
  // Moral traits
  merciful: ['spare', 'mercy', 'forgive', 'let go', 'compassion', 'release'],
  ruthless: ['kill', 'execute', 'destroy', 'crush', 'eliminate', 'no mercy'],
  honorable: ['promise', 'oath', 'honor', 'fair fight', 'keep word', 'honest'],
  pragmatic: ['practical', 'efficient', 'expedient', 'necessary evil'],
  idealistic: ['principle', 'belief', 'ideal', 'moral', 'righteous'],

  // Emotional traits
  haunted: ['nightmare', 'trauma', 'regret', 'guilt', 'torment', 'haunt'],
  hopeful: ['hope', 'optimistic', 'bright side', 'believe', 'faith'],
  bitter: ['resent', 'bitter', 'grudge', 'never forget', 'vengeance'],

  // Capability traits
  'battle-hardened': ['combat', 'fight', 'battle', 'victory', 'defeat enemy', 'slay'],
  scholarly: ['study', 'research', 'learn', 'knowledge', 'tome', 'book', 'ancient text'],
  'street-wise': ['survive', 'street', 'hustle', 'quick thinking', 'resourceful'],
  cunning: ['clever', 'trick', 'outsmart', 'scheme', 'manipulate', 'deceive'],

  // Reputation traits
  feared: ['terror', 'flee', 'cower', 'intimidate', 'fear me'],
  beloved: ['beloved', 'adore', 'love', 'cherish', 'grateful'],
  notorious: ['infamous', 'notorious', 'criminal', 'villain'],
  legendary: ['legend', 'famous', 'renowned', 'hero', 'great deed'],
};

/**
 * Relationship-affecting keywords and their dimension impacts
 */
const RELATIONSHIP_KEYWORDS: Record<string, { dimension: RelationshipDetection['dimension']; change: number }[]> = {
  // Trust-building
  help: [{ dimension: 'trust', change: 0.1 }],
  save: [{ dimension: 'trust', change: 0.15 }, { dimension: 'affection', change: 0.1 }],
  protect: [{ dimension: 'trust', change: 0.1 }],
  honest: [{ dimension: 'trust', change: 0.1 }],
  truth: [{ dimension: 'trust', change: 0.05 }],

  // Trust-breaking
  betray: [{ dimension: 'trust', change: -0.3 }, { dimension: 'resentment', change: 0.2 }],
  lie: [{ dimension: 'trust', change: -0.15 }],
  deceive: [{ dimension: 'trust', change: -0.2 }],
  abandon: [{ dimension: 'trust', change: -0.2 }, { dimension: 'resentment', change: 0.15 }],

  // Respect-building
  impress: [{ dimension: 'respect', change: 0.1 }],
  skill: [{ dimension: 'respect', change: 0.05 }],
  wise: [{ dimension: 'respect', change: 0.1 }],
  victory: [{ dimension: 'respect', change: 0.1 }],
  honor: [{ dimension: 'respect', change: 0.1 }],

  // Respect-breaking
  humiliate: [{ dimension: 'respect', change: -0.2 }, { dimension: 'resentment', change: 0.15 }],
  mock: [{ dimension: 'respect', change: -0.1 }],
  coward: [{ dimension: 'respect', change: -0.15 }],

  // Fear-inducing
  threaten: [{ dimension: 'fear', change: 0.15 }],
  intimidate: [{ dimension: 'fear', change: 0.2 }],
  torture: [{ dimension: 'fear', change: 0.3 }, { dimension: 'resentment', change: 0.2 }],
  kill: [{ dimension: 'fear', change: 0.25 }],

  // Debt-creating
  owe: [{ dimension: 'debt', change: 0.2 }],
  favor: [{ dimension: 'debt', change: 0.15 }],
  gift: [{ dimension: 'affection', change: 0.1 }, { dimension: 'debt', change: 0.1 }],
};

/**
 * Detects potential trait evolutions from a single event
 *
 * @param event - The game event to analyze
 * @param actorType - Entity type of the actor (who performed the action)
 * @param actorId - Entity ID of the actor
 * @returns Array of detected trait suggestions
 */
export function detectTraitsFromEvent(
  event: CanonicalEvent,
  actorType: EntityType,
  actorId: string
): TraitDetection[] {
  const detections: TraitDetection[] = [];
  const contentLower = event.content.toLowerCase();

  for (const [trait, keywords] of Object.entries(TRAIT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (contentLower.includes(keyword)) {
        detections.push({
          entityType: actorType,
          entityId: actorId,
          trait,
          reason: `Event contains "${keyword}" suggesting ${trait} behavior`,
        });
        // Only detect each trait once per event
        break;
      }
    }
  }

  return detections;
}

/**
 * Detects potential relationship changes from a single event
 *
 * @param event - The game event to analyze
 * @param actorType - Entity type of the actor
 * @param actorId - Entity ID of the actor
 * @param targetType - Entity type of the target (if known)
 * @param targetId - Entity ID of the target (if known)
 * @returns Array of detected relationship changes
 */
export function detectRelationshipsFromEvent(
  event: CanonicalEvent,
  actorType: EntityType,
  actorId: string,
  targetType?: EntityType,
  targetId?: string
): RelationshipDetection[] {
  // If no target specified, try to detect from witnesses
  if (!targetType || !targetId) {
    return detectRelationshipsFromWitnesses(event, actorType, actorId);
  }

  const detections: RelationshipDetection[] = [];
  const contentLower = event.content.toLowerCase();

  for (const [keyword, impacts] of Object.entries(RELATIONSHIP_KEYWORDS)) {
    if (contentLower.includes(keyword)) {
      for (const impact of impacts) {
        detections.push({
          fromType: targetType, // The target's feelings toward the actor
          fromId: targetId,
          toType: actorType,
          toId: actorId,
          dimension: impact.dimension,
          change: impact.change,
          reason: `Event contains "${keyword}" affecting ${impact.dimension}`,
        });
      }
    }
  }

  return detections;
}

/**
 * Detects relationship changes affecting event witnesses
 *
 * @param event - The game event to analyze
 * @param actorType - Entity type of the actor
 * @param actorId - Entity ID of the actor
 * @returns Array of detected relationship changes for witnesses
 */
function detectRelationshipsFromWitnesses(
  event: CanonicalEvent,
  actorType: EntityType,
  actorId: string
): RelationshipDetection[] {
  const detections: RelationshipDetection[] = [];

  // Only process if there are witnesses
  if (!event.witnesses || event.witnesses.length === 0) {
    return detections;
  }

  const contentLower = event.content.toLowerCase();

  // Detect broad impressions that affect all witnesses
  for (const [keyword, impacts] of Object.entries(RELATIONSHIP_KEYWORDS)) {
    if (contentLower.includes(keyword)) {
      for (const witnessId of event.witnesses) {
        for (const impact of impacts) {
          // Witnesses are affected at half strength
          detections.push({
            fromType: 'npc' as EntityType, // Assume witnesses are NPCs
            fromId: witnessId,
            toType: actorType,
            toId: actorId,
            dimension: impact.dimension,
            change: impact.change * 0.5,
            reason: `Witnessed event containing "${keyword}"`,
          });
        }
      }
    }
  }

  return detections;
}

/**
 * Analyzes patterns across multiple events to detect trait suggestions
 *
 * @param events - Array of events to analyze for patterns
 * @param actorType - Entity type of the actor
 * @param actorId - Entity ID of the actor
 * @param threshold - Number of occurrences needed to suggest trait (default: 3)
 * @returns Array of trait detections that meet the threshold
 */
export function detectTraitsFromPatterns(
  events: CanonicalEvent[],
  actorType: EntityType,
  actorId: string,
  threshold: number = 3
): TraitDetection[] {
  // Count trait keyword occurrences across all events
  const traitCounts: Record<string, { count: number; reasons: string[] }> = {};

  for (const event of events) {
    const contentLower = event.content.toLowerCase();

    for (const [trait, keywords] of Object.entries(TRAIT_KEYWORDS)) {
      for (const keyword of keywords) {
        if (contentLower.includes(keyword)) {
          if (!traitCounts[trait]) {
            traitCounts[trait] = { count: 0, reasons: [] };
          }
          traitCounts[trait].count++;
          traitCounts[trait].reasons.push(`Turn ${event.turn}: "${keyword}"`);
          // Only count each trait once per event
          break;
        }
      }
    }
  }

  // Return traits that meet the threshold
  const detections: TraitDetection[] = [];
  for (const [trait, data] of Object.entries(traitCounts)) {
    if (data.count >= threshold) {
      detections.push({
        entityType: actorType,
        entityId: actorId,
        trait,
        reason: `Repeated ${trait} actions (${data.count} occurrences): ${data.reasons.slice(0, 3).join(', ')}${data.count > 3 ? '...' : ''}`,
      });
    }
  }

  return detections;
}

/**
 * Aggregates relationship changes from multiple events
 *
 * @param events - Array of events to analyze
 * @param actorType - Entity type of the actor
 * @param actorId - Entity ID of the actor
 * @param targetType - Entity type of the specific target
 * @param targetId - Entity ID of the specific target
 * @returns Aggregated relationship detection (if total change is significant)
 */
export function aggregateRelationshipChanges(
  events: CanonicalEvent[],
  actorType: EntityType,
  actorId: string,
  targetType: EntityType,
  targetId: string
): RelationshipDetection[] {
  const dimensionTotals: Record<RelationshipDetection['dimension'], { total: number; reasons: string[] }> = {
    trust: { total: 0, reasons: [] },
    respect: { total: 0, reasons: [] },
    affection: { total: 0, reasons: [] },
    fear: { total: 0, reasons: [] },
    resentment: { total: 0, reasons: [] },
    debt: { total: 0, reasons: [] },
  };

  for (const event of events) {
    const changes = detectRelationshipsFromEvent(event, actorType, actorId, targetType, targetId);
    for (const change of changes) {
      dimensionTotals[change.dimension].total += change.change;
      dimensionTotals[change.dimension].reasons.push(change.reason);
    }
  }

  // Only return dimensions with significant changes (>= 0.1 or <= -0.1)
  const detections: RelationshipDetection[] = [];
  const SIGNIFICANCE_THRESHOLD = 0.1;

  for (const [dimension, data] of Object.entries(dimensionTotals) as [RelationshipDetection['dimension'], { total: number; reasons: string[] }][]) {
    if (Math.abs(data.total) >= SIGNIFICANCE_THRESHOLD) {
      detections.push({
        fromType: targetType,
        fromId: targetId,
        toType: actorType,
        toId: actorId,
        dimension,
        change: data.total,
        reason: `Cumulative ${dimension} change: ${data.reasons.slice(0, 2).join('; ')}${data.reasons.length > 2 ? '...' : ''}`,
      });
    }
  }

  return detections;
}

/**
 * Creates evolution input from a trait detection
 */
export function traitDetectionToEvolutionInput(
  detection: TraitDetection,
  gameId: string,
  turn: number,
  sourceEventId?: string
): CreateEvolutionInput {
  const input: CreateEvolutionInput = {
    gameId,
    turn,
    evolutionType: 'trait_add',
    entityType: detection.entityType,
    entityId: detection.entityId,
    trait: detection.trait,
    reason: detection.reason,
  };
  if (sourceEventId !== undefined) {
    input.sourceEventId = sourceEventId;
  }
  return input;
}

/**
 * Creates evolution input from a relationship detection
 */
export function relationshipDetectionToEvolutionInput(
  detection: RelationshipDetection,
  gameId: string,
  turn: number,
  currentValue: number,
  sourceEventId?: string
): CreateEvolutionInput {
  const newValue = Math.max(0, Math.min(1, currentValue + detection.change));

  const input: CreateEvolutionInput = {
    gameId,
    turn,
    evolutionType: 'relationship_change',
    entityType: detection.fromType,
    entityId: detection.fromId,
    targetType: detection.toType,
    targetId: detection.toId,
    dimension: detection.dimension,
    oldValue: currentValue,
    newValue,
    reason: detection.reason,
  };
  if (sourceEventId !== undefined) {
    input.sourceEventId = sourceEventId;
  }
  return input;
}
