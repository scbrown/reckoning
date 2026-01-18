import type { TraitRepository, EntityType } from '../../db/repositories/trait-repository.js';
import type { RelationshipRepository } from '../../db/repositories/relationship-repository.js';
import type {
  PendingEvolutionRepository,
  PendingEvolution,
  UpdatePendingEvolutionInput,
} from '../../db/repositories/pending-evolution-repository.js';
import type {
  EvolutionSuggestion,
  GameEventRef,
  AggregateLabel,
  EntitySummary,
  RelationshipSummary,
  RelationshipDimensions,
  EvolutionEventEmitter,
} from './types.js';

/**
 * Configuration for EvolutionService
 */
export interface EvolutionServiceConfig {
  traitRepo: TraitRepository;
  relationshipRepo: RelationshipRepository;
  pendingRepo: PendingEvolutionRepository;
  eventEmitter?: EvolutionEventEmitter;
}

/**
 * Core service coordinating entity evolution through traits and relationships.
 *
 * Responsibilities:
 * - Queue evolution suggestions (from AI or system detection)
 * - Process DM approval/editing/refusal of evolutions
 * - Apply approved evolutions to entities
 * - Compute aggregate relationship labels
 * - Provide entity summaries for AI context
 */
export class EvolutionService {
  private traitRepo: TraitRepository;
  private relationshipRepo: RelationshipRepository;
  private pendingRepo: PendingEvolutionRepository;
  private eventEmitter: EvolutionEventEmitter | undefined;

  constructor(config: EvolutionServiceConfig) {
    this.traitRepo = config.traitRepo;
    this.relationshipRepo = config.relationshipRepo;
    this.pendingRepo = config.pendingRepo;
    this.eventEmitter = config.eventEmitter;
  }

  /**
   * Process evolution suggestions and queue them for DM review.
   *
   * Called after AI generates content. Accepts AI suggestions and optionally
   * runs system detection rules.
   *
   * @param gameId - The game to process evolutions for
   * @param event - The source event triggering evolution detection
   * @param aiSuggestions - Suggestions extracted from AI response
   * @returns Array of created pending evolutions
   */
  detectEvolutions(
    gameId: string,
    event: GameEventRef,
    aiSuggestions?: EvolutionSuggestion[]
  ): PendingEvolution[] {
    const pending: PendingEvolution[] = [];

    // Process AI suggestions
    if (aiSuggestions) {
      for (const suggestion of aiSuggestions) {
        // For relationship changes, resolve the change delta to absolute values
        let oldValue: number | undefined;
        let newValue: number | undefined;

        if (suggestion.evolutionType === 'relationship_change' &&
            suggestion.targetType && suggestion.targetId && suggestion.dimension) {
          const existing = this.relationshipRepo.findBetween(
            gameId,
            { type: suggestion.entityType, id: suggestion.entityId },
            { type: suggestion.targetType, id: suggestion.targetId }
          );

          if (existing) {
            oldValue = existing[suggestion.dimension];
            newValue = Math.max(0, Math.min(1, oldValue + (suggestion.change ?? 0)));
          } else {
            // New relationship, use defaults
            const defaults: RelationshipDimensions = {
              trust: 0.5,
              respect: 0.5,
              affection: 0.5,
              fear: 0.0,
              resentment: 0.0,
              debt: 0.0,
            };
            oldValue = defaults[suggestion.dimension];
            newValue = Math.max(0, Math.min(1, oldValue + (suggestion.change ?? 0)));
          }
        }

        const createInput: import('../../db/repositories/pending-evolution-repository.js').CreatePendingEvolutionInput = {
          gameId,
          turn: event.turn,
          evolutionType: suggestion.evolutionType,
          entityType: suggestion.entityType,
          entityId: suggestion.entityId,
          reason: suggestion.reason,
          sourceEventId: event.id,
        };
        if (suggestion.trait) createInput.trait = suggestion.trait;
        if (suggestion.targetType) createInput.targetType = suggestion.targetType;
        if (suggestion.targetId) createInput.targetId = suggestion.targetId;
        if (suggestion.dimension) createInput.dimension = suggestion.dimension;
        if (oldValue !== undefined) createInput.oldValue = oldValue;
        if (newValue !== undefined) createInput.newValue = newValue;

        const created = this.pendingRepo.create(createInput);

        pending.push(created);
        this.emitEvent({ type: 'evolution:created', pending: created });
      }
    }

    return pending;
  }

  /**
   * Approve a pending evolution and apply it.
   *
   * @param pendingId - ID of the pending evolution to approve
   * @param dmNotes - Optional notes from the DM
   */
  approve(pendingId: string, dmNotes?: string): void {
    const pending = this.pendingRepo.findById(pendingId);
    if (!pending) {
      throw new Error(`Pending evolution not found: ${pendingId}`);
    }

    if (pending.status !== 'pending') {
      throw new Error(`Cannot approve evolution with status: ${pending.status}`);
    }

    // Apply the evolution
    this.applyEvolution(pending);

    // Mark as approved
    this.pendingRepo.resolve(pendingId, 'approved', dmNotes);

    // Re-fetch to get updated state
    const updated = this.pendingRepo.findById(pendingId);
    if (updated) {
      this.emitEvent({ type: 'evolution:approved', pending: updated });
    }
  }

  /**
   * Edit a pending evolution and then approve it.
   *
   * @param pendingId - ID of the pending evolution to edit
   * @param changes - Changes to apply before approval
   * @param dmNotes - Optional notes from the DM
   */
  edit(pendingId: string, changes: UpdatePendingEvolutionInput, dmNotes?: string): void {
    const pending = this.pendingRepo.findById(pendingId);
    if (!pending) {
      throw new Error(`Pending evolution not found: ${pendingId}`);
    }

    if (pending.status !== 'pending') {
      throw new Error(`Cannot edit evolution with status: ${pending.status}`);
    }

    // Apply the edits
    this.pendingRepo.update(pendingId, changes);

    // Get the updated pending evolution
    const updated = this.pendingRepo.findById(pendingId);
    if (!updated) {
      throw new Error(`Failed to update pending evolution: ${pendingId}`);
    }

    // Apply the evolution
    this.applyEvolution(updated);

    // Mark as edited (approved with modifications)
    this.pendingRepo.resolve(pendingId, 'edited', dmNotes);

    // Re-fetch to get updated state
    const final = this.pendingRepo.findById(pendingId);
    if (final) {
      this.emitEvent({ type: 'evolution:edited', pending: final });
    }
  }

  /**
   * Refuse a pending evolution.
   *
   * @param pendingId - ID of the pending evolution to refuse
   * @param dmNotes - Optional notes explaining the refusal
   */
  refuse(pendingId: string, dmNotes?: string): void {
    const pending = this.pendingRepo.findById(pendingId);
    if (!pending) {
      throw new Error(`Pending evolution not found: ${pendingId}`);
    }

    if (pending.status !== 'pending') {
      throw new Error(`Cannot refuse evolution with status: ${pending.status}`);
    }

    this.pendingRepo.resolve(pendingId, 'refused', dmNotes);

    // Re-fetch to get updated state
    const updated = this.pendingRepo.findById(pendingId);
    if (updated) {
      this.emitEvent({ type: 'evolution:refused', pending: updated });
    }
  }

  /**
   * Get a summary of an entity's traits and relationships.
   *
   * Used to provide context for AI generation.
   *
   * @param gameId - The game to query
   * @param entityType - Type of entity
   * @param entityId - ID of entity
   * @returns Entity summary with traits and relationships
   */
  getEntitySummary(gameId: string, entityType: EntityType, entityId: string): EntitySummary {
    // Get active traits
    const traits = this.traitRepo.findByEntity(gameId, entityType, entityId);
    const traitNames = traits.map(t => t.trait);

    // Get relationships
    const relationships = this.relationshipRepo.findByEntity(
      gameId,
      { type: entityType, id: entityId }
    );

    const relationshipSummaries: RelationshipSummary[] = relationships.map(rel => {
      // Determine which end is the "other" entity
      const isFrom = rel.from.type === entityType && rel.from.id === entityId;
      const other = isFrom ? rel.to : rel.from;

      const dimensions: RelationshipDimensions = {
        trust: rel.trust,
        respect: rel.respect,
        affection: rel.affection,
        fear: rel.fear,
        resentment: rel.resentment,
        debt: rel.debt,
      };

      return {
        targetType: other.type,
        targetId: other.id,
        label: this.computeAggregateLabel(dimensions),
        dimensions,
      };
    });

    return {
      entityType,
      entityId,
      traits: traitNames,
      relationships: relationshipSummaries,
    };
  }

  /**
   * Compute an aggregate human-readable label for relationship dimensions.
   *
   * Labels represent the overall "feel" of a relationship based on
   * dimension values. Used for AI context and display.
   *
   * @param dimensions - The relationship dimensions to evaluate
   * @returns A label describing the relationship
   */
  computeAggregateLabel(dimensions: RelationshipDimensions): AggregateLabel {
    const { trust, respect, affection, fear, resentment, debt } = dimensions;

    // Devoted: High trust + affection + respect (very positive)
    if (trust > 0.7 && affection > 0.7 && respect > 0.6) {
      return 'devoted';
    }

    // Terrified: Very high fear (potential villain creation)
    if (fear > 0.7 && resentment > 0.5) {
      return 'terrified';
    }

    // Enemy: High fear and resentment but may lack respect
    if (fear > 0.5 && resentment > 0.6) {
      return 'enemy';
    }

    // Rival: Respect mixed with resentment (worthy adversary)
    if (respect > 0.5 && resentment > 0.5) {
      return 'rival';
    }

    // Resentful: High resentment without the fear
    if (resentment > 0.6) {
      return 'resentful';
    }

    // Ally: High trust and respect without strong affection
    if (trust > 0.6 && respect > 0.6) {
      return 'ally';
    }

    // Friend: High affection and trust
    if (affection > 0.6 && trust > 0.5) {
      return 'friend';
    }

    // Indebted: Significant debt dominates
    if (debt > 0.6) {
      return 'indebted';
    }

    // Wary: Low trust or moderate fear
    if (trust < 0.3 || fear > 0.4) {
      return 'wary';
    }

    // Default: No strong feelings either way
    return 'indifferent';
  }

  /**
   * Get pending evolutions for a game.
   *
   * @param gameId - The game to query
   * @param pendingOnly - If true, only return pending (not resolved) evolutions
   * @returns Array of pending evolutions
   */
  getPendingEvolutions(gameId: string, pendingOnly: boolean = true): PendingEvolution[] {
    return this.pendingRepo.findByGame(gameId, pendingOnly ? 'pending' : undefined);
  }

  /**
   * Apply a pending evolution to the actual entity state.
   */
  private applyEvolution(pending: PendingEvolution): void {
    switch (pending.evolutionType) {
      case 'trait_add': {
        if (!pending.trait) {
          throw new Error('Trait is required for trait_add evolution');
        }
        const addTraitInput: import('../../db/repositories/trait-repository.js').AddTraitInput = {
          gameId: pending.gameId,
          entityType: pending.entityType,
          entityId: pending.entityId,
          trait: pending.trait,
          turn: pending.turn,
        };
        if (pending.sourceEventId) {
          addTraitInput.sourceEventId = pending.sourceEventId;
        }
        this.traitRepo.addTrait(addTraitInput);
        break;
      }

      case 'trait_remove':
        if (!pending.trait) {
          throw new Error('Trait is required for trait_remove evolution');
        }
        this.traitRepo.removeTrait(
          pending.gameId,
          pending.entityType,
          pending.entityId,
          pending.trait
        );
        break;

      case 'relationship_change':
        if (!pending.targetType || !pending.targetId || !pending.dimension || pending.newValue === undefined) {
          throw new Error('Target, dimension, and newValue are required for relationship_change evolution');
        }
        this.relationshipRepo.upsert({
          gameId: pending.gameId,
          from: { type: pending.entityType, id: pending.entityId },
          to: { type: pending.targetType, id: pending.targetId },
          updatedTurn: pending.turn,
          [pending.dimension]: pending.newValue,
        });
        break;

      default:
        throw new Error(`Unknown evolution type: ${pending.evolutionType}`);
    }
  }

  private emitEvent(event: import('./types.js').EvolutionEvent): void {
    if (this.eventEmitter) {
      this.eventEmitter.emit(event);
    }
  }
}
