/**
 * Art Evolution Service
 *
 * Service for evolving character art over game progression.
 * Handles triggers (act transitions, major events, status effects, equipment changes)
 * and applies evolution strategies (variant, composition, regenerate).
 */

import { randomUUID } from 'crypto';
import type { EntityType } from '../../db/repositories/trait-repository.js';
import type {
  ArtEvolutionTrigger,
  ArtEvolutionStrategy,
  ArtEvolutionTriggerContext,
  ArtEvolutionRequest,
  ArtEvolutionResult,
  ArtEvolutionParams,
  ArtArchiveEntry,
  ArtEvolutionHistory,
  ArtEvolutionEventEmitter,
  PaletteModification,
  CompositionLayer,
  TraitVisualMapping,
  ActTransitionData,
  MajorEventData,
  StatusEffectData,
  EquipmentChangeData,
} from './types.js';
import { TRAIT_VISUAL_MAPPINGS } from './types.js';

/**
 * Configuration for ArtEvolutionService
 */
export interface ArtEvolutionServiceConfig {
  /** Optional event emitter for art evolution events */
  eventEmitter?: ArtEvolutionEventEmitter;
  /** Custom trait visual mappings (merged with defaults) */
  customTraitMappings?: TraitVisualMapping[];
}

/**
 * In-memory archive storage (would be database in production)
 */
interface ArchiveStorage {
  entries: Map<string, ArtArchiveEntry>;
  byEntity: Map<string, string[]>; // entityKey -> entry IDs
}

/**
 * Service for managing art evolution through game progression.
 *
 * Responsibilities:
 * - Process evolution triggers (act transitions, events, traits, equipment)
 * - Apply evolution strategies (variant, composition, regenerate)
 * - Archive art history for entities
 * - Provide art history for review/rollback
 */
export class ArtEvolutionService {
  private eventEmitter: ArtEvolutionEventEmitter | undefined;
  private traitMappings: Map<string, TraitVisualMapping>;
  private archive: ArchiveStorage;

  constructor(config: ArtEvolutionServiceConfig = {}) {
    this.eventEmitter = config.eventEmitter;

    // Build trait mappings lookup
    this.traitMappings = new Map();
    for (const mapping of TRAIT_VISUAL_MAPPINGS) {
      this.traitMappings.set(mapping.trait, mapping);
    }
    if (config.customTraitMappings) {
      for (const mapping of config.customTraitMappings) {
        this.traitMappings.set(mapping.trait, mapping);
      }
    }

    // Initialize archive storage
    this.archive = {
      entries: new Map(),
      byEntity: new Map(),
    };
  }

  /**
   * Process an art evolution trigger and determine if evolution should occur.
   *
   * @param context - The trigger context with all relevant information
   * @returns Evolution request if evolution should occur, null otherwise
   */
  processTrigger(context: ArtEvolutionTriggerContext): ArtEvolutionRequest | null {
    const { trigger, data } = context;

    switch (trigger) {
      case 'act_transition':
        return this.processActTransition(context, data as ActTransitionData);

      case 'major_event':
        return this.processMajorEvent(context, data as MajorEventData);

      case 'status_effect':
        return this.processStatusEffect(context, data as StatusEffectData);

      case 'equipment_change':
        return this.processEquipmentChange(context, data as EquipmentChangeData);

      default:
        return null;
    }
  }

  /**
   * Execute an art evolution request.
   *
   * @param request - The evolution request to execute
   * @returns Result of the evolution
   */
  async evolve(request: ArtEvolutionRequest): Promise<ArtEvolutionResult> {
    this.emitEvent({ type: 'art:evolution_started', request });

    try {
      let result: ArtEvolutionResult;

      switch (request.strategy) {
        case 'variant':
          result = this.applyVariantStrategy(request);
          break;

        case 'composition':
          result = this.applyCompositionStrategy(request);
          break;

        case 'regenerate':
          result = await this.applyRegenerateStrategy(request);
          break;

        default:
          result = {
            success: false,
            error: `Unknown strategy: ${request.strategy}`,
          };
      }

      if (result.success) {
        this.emitEvent({ type: 'art:evolution_completed', result, request });
      } else {
        this.emitEvent({ type: 'art:evolution_failed', error: result.error || 'Unknown error', request });
      }

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emitEvent({ type: 'art:evolution_failed', error: errorMsg, request });
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Archive the current art for an entity before evolution.
   *
   * @param gameId - Game ID
   * @param entityType - Type of entity
   * @param entityId - Entity ID
   * @param source - Current pixelsrc source
   * @param spriteName - Current sprite name
   * @param turn - Current turn number
   * @param trigger - What triggered this archive (if evolving)
   * @returns The created archive entry
   */
  archiveArt(
    gameId: string,
    entityType: EntityType,
    entityId: string,
    source: string,
    spriteName: string,
    turn: number,
    trigger?: ArtEvolutionTrigger
  ): ArtArchiveEntry {
    const entityKey = this.getEntityKey(gameId, entityType, entityId);

    // Close out any existing "current" entry
    const existingIds = this.archive.byEntity.get(entityKey) || [];
    for (const id of existingIds) {
      const entry = this.archive.entries.get(id);
      if (entry && entry.toTurn === undefined) {
        entry.toTurn = turn;
        entry.trigger = trigger;
      }
    }

    // Create new archive entry
    const entry: ArtArchiveEntry = {
      id: randomUUID(),
      gameId,
      entityType,
      entityId,
      source,
      spriteName,
      fromTurn: turn,
      createdAt: new Date().toISOString(),
    };

    // Store the entry
    this.archive.entries.set(entry.id, entry);
    if (!this.archive.byEntity.has(entityKey)) {
      this.archive.byEntity.set(entityKey, []);
    }
    this.archive.byEntity.get(entityKey)!.push(entry.id);

    this.emitEvent({ type: 'art:archived', entry });

    return entry;
  }

  /**
   * Get the art evolution history for an entity.
   *
   * @param gameId - Game ID
   * @param entityType - Type of entity
   * @param entityId - Entity ID
   * @returns Full art history for the entity
   */
  getHistory(gameId: string, entityType: EntityType, entityId: string): ArtEvolutionHistory {
    const entityKey = this.getEntityKey(gameId, entityType, entityId);
    const entryIds = this.archive.byEntity.get(entityKey) || [];

    const entries = entryIds
      .map(id => this.archive.entries.get(id))
      .filter((e): e is ArtArchiveEntry => e !== undefined)
      .sort((a, b) => b.fromTurn - a.fromTurn); // Newest first

    const current = entries.find(e => e.toTurn === undefined) || null;
    const history = entries.filter(e => e.toTurn !== undefined);

    return {
      entityType,
      entityId,
      current,
      history,
    };
  }

  /**
   * Get a specific archive entry by ID.
   */
  getArchiveEntry(id: string): ArtArchiveEntry | null {
    return this.archive.entries.get(id) || null;
  }

  /**
   * Get the visual mapping for a trait.
   */
  getTraitMapping(trait: string): TraitVisualMapping | undefined {
    return this.traitMappings.get(trait);
  }

  /**
   * Determine the appropriate strategy for an act transition.
   */
  private processActTransition(
    context: ArtEvolutionTriggerContext,
    data: ActTransitionData
  ): ArtEvolutionRequest | null {
    // Major act changes (1->2, 2->3, etc.) trigger regeneration
    // This creates distinctly different art for different story phases
    const actDiff = data.toAct - data.fromAct;

    if (actDiff >= 1) {
      return {
        triggerContext: context,
        strategy: 'regenerate',
        currentSource: '', // Would be filled by caller
        currentSpriteName: '', // Would be filled by caller
        params: {
          promptHints: [
            `Character has progressed from Act ${data.fromAct} to Act ${data.toAct}`,
            'Show passage of time and experience',
            actDiff >= 2 ? 'Significant visual transformation' : 'Subtle evolution',
          ],
        },
      };
    }

    return null;
  }

  /**
   * Determine the appropriate strategy for a major event.
   */
  private processMajorEvent(
    context: ArtEvolutionTriggerContext,
    data: MajorEventData
  ): ArtEvolutionRequest | null {
    // Major events might warrant different strategies based on event type
    const strategyByEventType: Record<string, ArtEvolutionStrategy> = {
      narration: 'variant',
      party_action: 'composition',
      npc_action: 'composition',
      environment: 'variant',
    };

    const strategy = strategyByEventType[data.eventType] || 'variant';

    return {
      triggerContext: context,
      strategy,
      currentSource: '',
      currentSpriteName: '',
      params: {
        promptHints: [
          `Event: ${data.description}`,
          `Event type: ${data.eventType}`,
        ],
      },
    };
  }

  /**
   * Determine the appropriate strategy for a status effect (trait change).
   */
  private processStatusEffect(
    context: ArtEvolutionTriggerContext,
    data: StatusEffectData
  ): ArtEvolutionRequest | null {
    // Look up trait visual mapping
    const mapping = this.traitMappings.get(data.trait);

    if (!mapping) {
      // No visual mapping for this trait, skip
      return null;
    }

    // If trait is being removed, we might want to revert
    // For now, we only handle trait additions
    if (data.action === 'removed') {
      return null;
    }

    return {
      triggerContext: context,
      strategy: mapping.strategy,
      currentSource: '',
      currentSpriteName: '',
      params: mapping.params,
    };
  }

  /**
   * Determine the appropriate strategy for an equipment change.
   */
  private processEquipmentChange(
    context: ArtEvolutionTriggerContext,
    data: EquipmentChangeData
  ): ArtEvolutionRequest | null {
    // Equipment changes typically use composition to layer gear
    return {
      triggerContext: context,
      strategy: 'composition',
      currentSource: '',
      currentSpriteName: '',
      params: {
        layers: data.newItem
          ? [{ spriteName: `equipment_${data.slot}_${data.newItem}`, zIndex: 1 }]
          : [], // Empty layers if removing equipment
        promptHints: [
          `Equipment slot: ${data.slot}`,
          data.previousItem ? `Removing: ${data.previousItem}` : 'Empty slot',
          data.newItem ? `Adding: ${data.newItem}` : 'Unequipping',
        ],
      },
    };
  }

  /**
   * Apply the variant (palette swap) strategy.
   */
  private applyVariantStrategy(request: ArtEvolutionRequest): ArtEvolutionResult {
    const { currentSource, currentSpriteName, params } = request;
    const modifications = params?.paletteModifications || [];

    if (modifications.length === 0) {
      return {
        success: false,
        error: 'No palette modifications specified for variant strategy',
      };
    }

    // Parse the pixelsrc source (JSONL format)
    const lines = currentSource.split('\n').filter(line => line.trim().length > 0);
    const modifiedLines: string[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);

        // Modify palette entries
        if (parsed.type === 'palette' || (parsed.type === 'sprite' && parsed.palette)) {
          const palette = parsed.palette || parsed.colors;
          if (palette) {
            for (const mod of modifications) {
              if (palette[mod.originalKey] !== undefined) {
                palette[mod.originalKey] = mod.newColor;
              }
            }
          }
        }

        modifiedLines.push(JSON.stringify(parsed));
      } catch {
        // Keep malformed lines as-is
        modifiedLines.push(line);
      }
    }

    // Generate new sprite name
    const newSpriteName = `${currentSpriteName}_variant_${Date.now()}`;

    // Create archive entry for the old art
    const archiveEntry = this.archiveArt(
      request.triggerContext.gameId,
      request.triggerContext.entityType,
      request.triggerContext.entityId,
      currentSource,
      currentSpriteName,
      request.triggerContext.turn,
      request.triggerContext.trigger
    );

    return {
      success: true,
      newSource: modifiedLines.join('\n'),
      newSpriteName,
      archiveEntry,
    };
  }

  /**
   * Apply the composition (layer-based) strategy.
   */
  private applyCompositionStrategy(request: ArtEvolutionRequest): ArtEvolutionResult {
    const { currentSource, currentSpriteName, params } = request;
    const layers = params?.layers || [];

    if (layers.length === 0) {
      return {
        success: false,
        error: 'No layers specified for composition strategy',
      };
    }

    // Parse existing source
    const lines = currentSource.split('\n').filter(line => line.trim().length > 0);

    // Create composition definition
    const compositionDef = {
      type: 'composition',
      name: `${currentSpriteName}_composed_${Date.now()}`,
      base: currentSpriteName,
      layers: layers.map(layer => ({
        sprite: layer.spriteName,
        zIndex: layer.zIndex,
        offset: layer.offset,
        opacity: layer.opacity,
      })),
    };

    // Add composition to source
    const modifiedLines = [...lines, JSON.stringify(compositionDef)];

    // Create archive entry
    const archiveEntry = this.archiveArt(
      request.triggerContext.gameId,
      request.triggerContext.entityType,
      request.triggerContext.entityId,
      currentSource,
      currentSpriteName,
      request.triggerContext.turn,
      request.triggerContext.trigger
    );

    return {
      success: true,
      newSource: modifiedLines.join('\n'),
      newSpriteName: compositionDef.name,
      archiveEntry,
    };
  }

  /**
   * Apply the regenerate (full new art) strategy.
   *
   * This is async because it would typically call an AI service.
   */
  private async applyRegenerateStrategy(request: ArtEvolutionRequest): Promise<ArtEvolutionResult> {
    const { currentSource, currentSpriteName, params } = request;
    const hints = params?.promptHints || [];

    // In a real implementation, this would:
    // 1. Call an AI service with the hints to generate new art
    // 2. Return the new pixelsrc source

    // For now, we create a placeholder that indicates regeneration is needed
    const regenerationMarker = {
      type: 'regeneration_pending',
      name: `${currentSpriteName}_regenerated_${Date.now()}`,
      baseSprite: currentSpriteName,
      hints,
      requestedAt: new Date().toISOString(),
    };

    // Create archive entry
    const archiveEntry = this.archiveArt(
      request.triggerContext.gameId,
      request.triggerContext.entityType,
      request.triggerContext.entityId,
      currentSource,
      currentSpriteName,
      request.triggerContext.turn,
      request.triggerContext.trigger
    );

    // For regenerate, we keep the old source but mark it for regeneration
    // The actual regeneration would be handled by an AI integration
    const lines = currentSource.split('\n').filter(line => line.trim().length > 0);
    const modifiedLines = [...lines, JSON.stringify(regenerationMarker)];

    return {
      success: true,
      newSource: modifiedLines.join('\n'),
      newSpriteName: regenerationMarker.name,
      archiveEntry,
    };
  }

  /**
   * Create a unique key for entity lookups.
   */
  private getEntityKey(gameId: string, entityType: EntityType, entityId: string): string {
    return `${gameId}:${entityType}:${entityId}`;
  }

  /**
   * Emit an event if an emitter is configured.
   */
  private emitEvent(event: import('./types.js').ArtEvolutionEvent): void {
    if (this.eventEmitter) {
      this.eventEmitter.emit(event);
    }
  }
}
