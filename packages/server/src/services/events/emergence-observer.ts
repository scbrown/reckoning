/**
 * EmergenceObserver Service
 *
 * Detects narrative emergence opportunities by analyzing relationship patterns
 * after events are committed. Identifies when NPCs might emerge as villains
 * or allies based on relationship dimension thresholds.
 */

import type { CanonicalEvent, ActorType } from '@reckoning/shared/game';
import type {
  RelationshipRepository,
  Relationship,
  Entity,
  EntityType,
} from '../../db/repositories/relationship-repository.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Types of narrative emergence that can be detected
 */
export type EmergenceType = 'villain' | 'ally';

/**
 * An opportunity for narrative emergence
 */
export interface EmergenceOpportunity {
  /** Type of emergence detected */
  type: EmergenceType;
  /** The entity that could emerge in this role */
  entity: Entity;
  /** Confidence level (0.0 to 1.0) */
  confidence: number;
  /** Human-readable reason for this detection */
  reason: string;
  /** The event that triggered this detection */
  triggeringEventId: string;
  /** Relationship dimensions that contributed to this detection */
  contributingFactors: {
    dimension: string;
    value: number;
    threshold: number;
  }[];
}

/**
 * Result of emergence detection for an event
 */
export interface EmergenceDetectionResult {
  /** Event that was analyzed */
  eventId: string;
  /** All emergence opportunities detected */
  opportunities: EmergenceOpportunity[];
  /** ISO timestamp of detection */
  timestamp: string;
}

/**
 * Configuration thresholds for emergence detection
 */
export interface EmergenceThresholds {
  /** Minimum fear for villain emergence */
  villainFear: number;
  /** Minimum resentment for villain emergence */
  villainResentment: number;
  /** Minimum trust for ally emergence */
  allyTrust: number;
  /** Minimum respect for ally emergence */
  allyRespect: number;
  /** Minimum affection for ally emergence */
  allyAffection: number;
  /** High threshold (triggers strong confidence) */
  high: number;
  /** Medium threshold (triggers moderate confidence) */
  medium: number;
}

/**
 * Configuration for EmergenceObserver
 */
export interface EmergenceObserverConfig {
  relationshipRepo: RelationshipRepository;
  thresholds?: Partial<EmergenceThresholds>;
  eventEmitter?: EmergenceEventEmitter;
}

/**
 * Event types emitted by the observer
 */
export type EmergenceEvent =
  | { type: 'emergence:detected'; result: EmergenceDetectionResult }
  | { type: 'emergence:villain'; opportunity: EmergenceOpportunity }
  | { type: 'emergence:ally'; opportunity: EmergenceOpportunity };

/**
 * Optional event emitter interface
 */
export interface EmergenceEventEmitter {
  emit(event: EmergenceEvent): void;
}

// =============================================================================
// Default Thresholds
// =============================================================================

const DEFAULT_THRESHOLDS: EmergenceThresholds = {
  villainFear: 0.6,
  villainResentment: 0.5,
  allyTrust: 0.6,
  allyRespect: 0.6,
  allyAffection: 0.5,
  high: 0.8,
  medium: 0.6,
};

// =============================================================================
// EmergenceObserver Class
// =============================================================================

/**
 * Service for detecting narrative emergence opportunities.
 *
 * Monitors committed events and analyzes relationship patterns to identify
 * when NPCs might naturally emerge as villains or allies in the narrative.
 *
 * Villain emergence is triggered by:
 * - High fear + resentment (the player has wronged them)
 * - Patterns of violence or betrayal toward the NPC
 *
 * Ally emergence is triggered by:
 * - High trust + respect (the player has earned their respect)
 * - High affection (the player has befriended them)
 * - Patterns of mercy, help, or honest dealings
 */
export class EmergenceObserver {
  private relationshipRepo: RelationshipRepository;
  private thresholds: EmergenceThresholds;
  private eventEmitter: EmergenceEventEmitter | undefined;

  constructor(config: EmergenceObserverConfig) {
    this.relationshipRepo = config.relationshipRepo;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...config.thresholds };
    this.eventEmitter = config.eventEmitter;
  }

  /**
   * Convert ActorType to EntityType if possible.
   * Returns undefined for 'system' since it can't have relationships.
   */
  private actorTypeToEntityType(actorType: ActorType): EntityType | undefined {
    if (actorType === 'system') {
      return undefined;
    }
    // ActorType without 'system' is a subset of EntityType
    return actorType as EntityType;
  }

  /**
   * Called when an event is committed to the event history.
   * Analyzes the event for emergence opportunities.
   *
   * @param event - The committed canonical event
   * @returns Detection result with any emergence opportunities
   */
  onEventCommitted(event: CanonicalEvent): EmergenceDetectionResult {
    const opportunities: EmergenceOpportunity[] = [];

    // Only analyze events that involve actors and targets
    if (!event.actorId || !event.actorType) {
      return this.createResult(event.id, opportunities);
    }

    // Convert actor type - skip system actors since they can't have relationships
    const actorEntityType = this.actorTypeToEntityType(event.actorType);
    if (!actorEntityType) {
      return this.createResult(event.id, opportunities);
    }

    // Check for emergence based on the actor
    const actorEntity: Entity = { type: actorEntityType, id: event.actorId };

    // Check relationships involving the actor
    const relationships = this.relationshipRepo.findByEntity(event.gameId, actorEntity);

    for (const relationship of relationships) {
      // Determine which end of the relationship is the "other" entity
      const isActorFrom = relationship.from.type === actorEntity.type &&
                          relationship.from.id === actorEntity.id;
      const otherEntity = isActorFrom ? relationship.to : relationship.from;

      // Only consider NPC relationships for emergence
      if (otherEntity.type !== 'npc') {
        continue;
      }

      // Check for villain emergence
      const villainOpportunity = this.checkVillainEmergence(
        relationship,
        otherEntity,
        event
      );
      if (villainOpportunity) {
        opportunities.push(villainOpportunity);
        this.emitEvent({ type: 'emergence:villain', opportunity: villainOpportunity });
      }

      // Check for ally emergence
      const allyOpportunity = this.checkAllyEmergence(
        relationship,
        otherEntity,
        event
      );
      if (allyOpportunity) {
        opportunities.push(allyOpportunity);
        this.emitEvent({ type: 'emergence:ally', opportunity: allyOpportunity });
      }
    }

    // Also check if the target is an NPC
    if (event.targetType === 'npc' && event.targetId) {
      const targetEntity: Entity = { type: 'npc', id: event.targetId };
      const targetRelationships = this.relationshipRepo.findByEntity(
        event.gameId,
        targetEntity
      );

      for (const relationship of targetRelationships) {
        // Find relationships where the NPC is the "from" side (their feelings)
        const isTargetFrom = relationship.from.type === targetEntity.type &&
                            relationship.from.id === targetEntity.id;

        if (!isTargetFrom) continue;

        const otherEntity = relationship.to;

        // Skip if we've already processed this relationship
        if (otherEntity.type === event.actorType && otherEntity.id === event.actorId) {
          continue;
        }

        // Check for villain emergence from target's perspective
        const villainOpportunity = this.checkVillainEmergence(
          relationship,
          targetEntity,
          event
        );
        if (villainOpportunity) {
          // Avoid duplicates
          const isDuplicate = opportunities.some(
            o => o.entity.id === villainOpportunity.entity.id && o.type === 'villain'
          );
          if (!isDuplicate) {
            opportunities.push(villainOpportunity);
            this.emitEvent({ type: 'emergence:villain', opportunity: villainOpportunity });
          }
        }

        // Check for ally emergence from target's perspective
        const allyOpportunity = this.checkAllyEmergence(
          relationship,
          targetEntity,
          event
        );
        if (allyOpportunity) {
          // Avoid duplicates
          const isDuplicate = opportunities.some(
            o => o.entity.id === allyOpportunity.entity.id && o.type === 'ally'
          );
          if (!isDuplicate) {
            opportunities.push(allyOpportunity);
            this.emitEvent({ type: 'emergence:ally', opportunity: allyOpportunity });
          }
        }
      }
    }

    const result = this.createResult(event.id, opportunities);

    if (opportunities.length > 0) {
      this.emitEvent({ type: 'emergence:detected', result });
    }

    return result;
  }

  /**
   * Check if an NPC is ready to emerge as a villain.
   *
   * Villain emergence requires:
   * - High fear (the NPC is afraid of the player/party)
   * - High resentment (the NPC harbors grudges)
   *
   * The combination suggests the NPC might seek revenge or oppose the player.
   *
   * @param relationship - The relationship to analyze
   * @param npcEntity - The NPC entity to check
   * @param event - The triggering event
   * @returns Emergence opportunity if detected, null otherwise
   */
  checkVillainEmergence(
    relationship: Relationship,
    npcEntity: Entity,
    event: CanonicalEvent
  ): EmergenceOpportunity | null {
    const { fear, resentment, trust, respect } = relationship;

    // Check if the NPC meets villain emergence thresholds
    const fearMet = fear >= this.thresholds.villainFear;
    const resentmentMet = resentment >= this.thresholds.villainResentment;

    // Both conditions must be met for villain emergence
    if (!fearMet || !resentmentMet) {
      return null;
    }

    // Low trust and respect strengthen the case
    const lowTrust = trust < 0.3;
    const lowRespect = respect < 0.4;

    const contributingFactors = [
      { dimension: 'fear', value: fear, threshold: this.thresholds.villainFear },
      { dimension: 'resentment', value: resentment, threshold: this.thresholds.villainResentment },
    ];

    if (lowTrust) {
      contributingFactors.push({ dimension: 'trust', value: trust, threshold: 0.3 });
    }
    if (lowRespect) {
      contributingFactors.push({ dimension: 'respect', value: respect, threshold: 0.4 });
    }

    const confidence = this.calculateConfidence('villain', {
      fear,
      resentment,
      trust,
      respect,
      affection: relationship.affection,
      debt: relationship.debt,
    });

    // Only report if confidence is meaningful
    if (confidence < 0.3) {
      return null;
    }

    const reason = this.generateVillainReason(fear, resentment, lowTrust, lowRespect);

    return {
      type: 'villain',
      entity: npcEntity,
      confidence,
      reason,
      triggeringEventId: event.id,
      contributingFactors,
    };
  }

  /**
   * Check if an NPC is ready to emerge as an ally.
   *
   * Ally emergence requires one of:
   * - High trust + high respect (earned loyalty)
   * - High affection + moderate trust (friendship)
   * - High debt + respect (feels obligated)
   *
   * @param relationship - The relationship to analyze
   * @param npcEntity - The NPC entity to check
   * @param event - The triggering event
   * @returns Emergence opportunity if detected, null otherwise
   */
  checkAllyEmergence(
    relationship: Relationship,
    npcEntity: Entity,
    event: CanonicalEvent
  ): EmergenceOpportunity | null {
    const { trust, respect, affection, debt, fear, resentment } = relationship;

    // Check various ally emergence patterns
    const trustRespectPath = trust >= this.thresholds.allyTrust &&
                              respect >= this.thresholds.allyRespect;
    const friendshipPath = affection >= this.thresholds.allyAffection &&
                           trust >= 0.5;
    const debtPath = debt >= 0.6 && respect >= 0.5;

    // At least one path must be met
    if (!trustRespectPath && !friendshipPath && !debtPath) {
      return null;
    }

    // High fear or resentment blocks ally emergence
    if (fear >= 0.5 || resentment >= 0.5) {
      return null;
    }

    const contributingFactors: EmergenceOpportunity['contributingFactors'] = [];

    if (trustRespectPath) {
      contributingFactors.push(
        { dimension: 'trust', value: trust, threshold: this.thresholds.allyTrust },
        { dimension: 'respect', value: respect, threshold: this.thresholds.allyRespect }
      );
    }
    if (friendshipPath) {
      contributingFactors.push(
        { dimension: 'affection', value: affection, threshold: this.thresholds.allyAffection }
      );
    }
    if (debtPath) {
      contributingFactors.push(
        { dimension: 'debt', value: debt, threshold: 0.6 }
      );
    }

    const confidence = this.calculateConfidence('ally', {
      trust,
      respect,
      affection,
      fear,
      resentment,
      debt,
    });

    // Only report if confidence is meaningful
    if (confidence < 0.3) {
      return null;
    }

    const reason = this.generateAllyReason(
      trustRespectPath,
      friendshipPath,
      debtPath,
      { trust, respect, affection, debt }
    );

    return {
      type: 'ally',
      entity: npcEntity,
      confidence,
      reason,
      triggeringEventId: event.id,
      contributingFactors,
    };
  }

  /**
   * Calculate confidence level for an emergence opportunity.
   *
   * Confidence is based on:
   * - How far above threshold the key dimensions are
   * - Presence of supporting factors (low opposing dimensions)
   * - Consistency of the pattern (multiple dimensions align)
   *
   * @param type - Type of emergence being calculated
   * @param dimensions - All relationship dimensions
   * @returns Confidence level from 0.0 to 1.0
   */
  calculateConfidence(
    type: EmergenceType,
    dimensions: {
      fear: number;
      resentment: number;
      trust: number;
      respect: number;
      affection: number;
      debt: number;
    }
  ): number {
    const { fear, resentment, trust, respect, affection, debt } = dimensions;

    if (type === 'villain') {
      // Base confidence from fear and resentment
      const fearScore = this.normalizeAboveThreshold(fear, this.thresholds.villainFear);
      const resentmentScore = this.normalizeAboveThreshold(resentment, this.thresholds.villainResentment);

      // Average of the two main factors
      let confidence = (fearScore + resentmentScore) / 2;

      // Boost for very high values
      if (fear >= this.thresholds.high) {
        confidence += 0.1;
      }
      if (resentment >= this.thresholds.high) {
        confidence += 0.1;
      }

      // Boost for low trust (they don't trust the player)
      if (trust < 0.3) {
        confidence += 0.1;
      }

      // Penalty for high respect (they might not actually oppose)
      if (respect >= 0.5) {
        confidence -= 0.15;
      }

      // Penalty for any remaining affection
      if (affection >= 0.4) {
        confidence -= 0.1;
      }

      return Math.max(0, Math.min(1, confidence));
    } else {
      // Ally confidence calculation
      let confidence = 0;
      let pathCount = 0;

      // Trust + Respect path
      if (trust >= this.thresholds.allyTrust && respect >= this.thresholds.allyRespect) {
        const trustScore = this.normalizeAboveThreshold(trust, this.thresholds.allyTrust);
        const respectScore = this.normalizeAboveThreshold(respect, this.thresholds.allyRespect);
        confidence += (trustScore + respectScore) / 2;
        pathCount++;
      }

      // Friendship path
      if (affection >= this.thresholds.allyAffection && trust >= 0.5) {
        const affectionScore = this.normalizeAboveThreshold(affection, this.thresholds.allyAffection);
        confidence += affectionScore;
        pathCount++;
      }

      // Debt path
      if (debt >= 0.6 && respect >= 0.5) {
        const debtScore = this.normalizeAboveThreshold(debt, 0.6);
        confidence += debtScore * 0.8; // Debt is slightly weaker
        pathCount++;
      }

      if (pathCount > 0) {
        confidence = confidence / pathCount;
      }

      // Boost for multiple paths converging
      if (pathCount >= 2) {
        confidence += 0.1;
      }
      if (pathCount >= 3) {
        confidence += 0.1;
      }

      // Penalty for fear or resentment
      if (fear >= 0.3) {
        confidence -= 0.15;
      }
      if (resentment >= 0.3) {
        confidence -= 0.15;
      }

      return Math.max(0, Math.min(1, confidence));
    }
  }

  /**
   * Normalize a value to show how far above a threshold it is.
   * Returns 0 if below threshold, up to 1 at maximum value.
   */
  private normalizeAboveThreshold(value: number, threshold: number): number {
    if (value < threshold) return 0;
    // How far from threshold to max (1.0)
    const range = 1.0 - threshold;
    const above = value - threshold;
    return Math.min(1, above / range);
  }

  /**
   * Generate a human-readable reason for villain emergence.
   */
  private generateVillainReason(
    fear: number,
    resentment: number,
    lowTrust: boolean,
    lowRespect: boolean
  ): string {
    const parts: string[] = [];

    if (fear >= this.thresholds.high) {
      parts.push('deeply fears the party');
    } else {
      parts.push('fears the party');
    }

    if (resentment >= this.thresholds.high) {
      parts.push('harbors deep resentment');
    } else {
      parts.push('harbors resentment');
    }

    if (lowTrust && lowRespect) {
      parts.push('with no trust or respect remaining');
    } else if (lowTrust) {
      parts.push('with broken trust');
    } else if (lowRespect) {
      parts.push('with no respect');
    }

    return `NPC ${parts.join(', ')}. May seek revenge or opposition.`;
  }

  /**
   * Generate a human-readable reason for ally emergence.
   */
  private generateAllyReason(
    trustRespectPath: boolean,
    friendshipPath: boolean,
    debtPath: boolean,
    dimensions: { trust: number; respect: number; affection: number; debt: number }
  ): string {
    const paths: string[] = [];

    if (trustRespectPath) {
      if (dimensions.trust >= this.thresholds.high && dimensions.respect >= this.thresholds.high) {
        paths.push('has earned deep trust and respect');
      } else {
        paths.push('has earned trust and respect');
      }
    }

    if (friendshipPath) {
      if (dimensions.affection >= this.thresholds.high) {
        paths.push('has formed a strong bond');
      } else {
        paths.push('has befriended them');
      }
    }

    if (debtPath) {
      paths.push('feels indebted to the party');
    }

    const reason = paths.join(' and ');
    return `NPC ${reason}. May offer aid or join the party.`;
  }

  /**
   * Create a detection result with timestamp.
   */
  private createResult(
    eventId: string,
    opportunities: EmergenceOpportunity[]
  ): EmergenceDetectionResult {
    return {
      eventId,
      opportunities,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Emit an event if an emitter is configured.
   */
  private emitEvent(event: EmergenceEvent): void {
    if (this.eventEmitter) {
      this.eventEmitter.emit(event);
    }
  }
}
