/**
 * Game State Filter Service
 *
 * Server-side filtering layer for game state based on view type.
 * Ensures each view only sees data appropriate to its role.
 */

import type Database from 'better-sqlite3';
import type { Character } from '@reckoning/shared';
import {
  RelationshipRepository,
  TraitRepository,
  PerceivedRelationshipRepository,
  type Relationship,
  type EntityTrait,
} from '../../db/repositories/index.js';
import type { PerceivedRelationship } from '../../db/repositories/perceived-relationship-repository.js';
import type {
  ViewType,
  FullGameState,
  PartyViewState,
  PlayerViewState,
  DMViewState,
  FilteredGameState,
  PartyAvatar,
  SceneDisplay,
  AreaDisplay,
  PartyMemberView,
  NPCView,
  FilteredTrait,
  PlayerRelationshipView,
} from './types.js';

/**
 * Service for filtering game state based on view type
 */
export class GameStateFilterService {
  private relationshipRepo: RelationshipRepository;
  private traitRepo: TraitRepository;
  private perceivedRelationshipRepo: PerceivedRelationshipRepository;

  constructor(db: Database.Database) {
    this.relationshipRepo = new RelationshipRepository(db);
    this.traitRepo = new TraitRepository(db);
    this.perceivedRelationshipRepo = new PerceivedRelationshipRepository(db);
  }

  /**
   * Filter game state for a specific view type
   *
   * @param state - Full game state
   * @param view - View type ('party', 'dm', or 'player')
   * @param characterId - Character ID (required for player view)
   * @returns Filtered game state appropriate for the view
   */
  filterGameStateForView(
    state: FullGameState,
    view: ViewType,
    characterId?: string
  ): FilteredGameState {
    switch (view) {
      case 'party':
        return this.filterForParty(state);
      case 'dm':
        return this.filterForDM(state);
      case 'player':
        if (!characterId) {
          throw new Error('characterId is required for player view');
        }
        return this.filterForPlayer(state, characterId);
    }
  }

  /**
   * Filter state for party view (display-only)
   * Shows: narration, avatars, scene - no controls/hidden data
   */
  private filterForParty(state: FullGameState): PartyViewState {
    return {
      narration: state.recentNarration,
      avatars: this.extractAvatars(state.characters),
      scene: this.extractSceneDisplay(state.currentScene),
      area: this.extractAreaDisplay(state.currentArea),
    };
  }

  /**
   * Filter state for DM view (full access)
   * Shows: everything
   */
  private filterForDM(state: FullGameState): DMViewState {
    // DM sees everything - return full state
    return state;
  }

  /**
   * Filter state for player view (character perspective)
   * Shows: filtered traits, perceived relationships
   * Hides: other players' character sheets, hidden traits, true relationship values
   */
  private filterForPlayer(state: FullGameState, characterId: string): PlayerViewState {
    const character = state.characters.find(c => c.id === characterId) ?? null;

    return {
      game: {
        id: state.game.id,
        turn: state.game.turn,
        currentAreaId: state.game.currentAreaId,
      },
      character,
      partyMembers: this.filterPartyMembers(state.characters, characterId, state.traits),
      area: this.extractAreaDisplay(state.currentArea),
      npcs: this.filterNPCs(state.npcs),
      ownTraits: this.filterOwnTraits(state.traits, characterId),
      relationships: this.buildPlayerRelationships(
        state,
        characterId,
        state.relationships,
        state.perceivedRelationships
      ),
      narration: state.recentNarration,
      scene: this.extractSceneDisplay(state.currentScene),
    };
  }

  /**
   * Extract avatar info for party view
   */
  private extractAvatars(characters: Character[]): PartyAvatar[] {
    return characters.map(c => ({
      id: c.id,
      name: c.name,
      pixelArtRef: c.pixelArtRef ? {
        path: c.pixelArtRef.path,
        spriteName: c.pixelArtRef.spriteName,
      } : undefined,
    }));
  }

  /**
   * Extract scene display info (public fields only)
   */
  private extractSceneDisplay(scene: FullGameState['currentScene']): SceneDisplay | null {
    if (!scene) return null;
    return {
      id: scene.id,
      name: scene.name,
      sceneType: scene.sceneType,
      mood: scene.mood ?? undefined,
    };
  }

  /**
   * Extract area display info
   */
  private extractAreaDisplay(area: FullGameState['currentArea']): AreaDisplay | null {
    if (!area) return null;
    return {
      id: area.id,
      name: area.name,
      description: area.description,
    };
  }

  /**
   * Filter party members for player view
   * Shows other members but only their public info
   */
  private filterPartyMembers(
    characters: Character[],
    excludeCharacterId: string,
    allTraits: EntityTrait[]
  ): PartyMemberView[] {
    return characters
      .filter(c => c.id !== excludeCharacterId)
      .map(c => ({
        id: c.id,
        name: c.name,
        class: c.class,
        visibleTraits: this.getVisibleTraits(allTraits, c.id),
      }));
  }

  /**
   * Get publicly visible traits for a character
   * In the future, this could filter based on trait visibility rules
   */
  private getVisibleTraits(allTraits: EntityTrait[], characterId: string): string[] {
    // For now, return reputation category traits which are publicly known
    // Other traits are considered private/hidden
    const reputationTraits = ['feared', 'beloved', 'notorious', 'mysterious', 'disgraced', 'legendary'];

    return allTraits
      .filter(t =>
        t.entityId === characterId &&
        t.entityType === 'character' &&
        t.status === 'active' &&
        reputationTraits.includes(t.trait)
      )
      .map(t => t.trait);
  }

  /**
   * Filter NPCs for player view
   * Shows public info only
   */
  private filterNPCs(npcs: FullGameState['npcs']): NPCView[] {
    return npcs.map(npc => ({
      id: npc.id,
      name: npc.name,
      description: npc.description,
      disposition: npc.disposition,
    }));
  }

  /**
   * Filter traits for the player's own character
   */
  private filterOwnTraits(allTraits: EntityTrait[], characterId: string): FilteredTrait[] {
    return allTraits
      .filter(t =>
        t.entityId === characterId &&
        t.entityType === 'character' &&
        t.status === 'active'
      )
      .map(t => ({
        trait: t.trait,
        acquiredTurn: t.acquiredTurn,
      }));
  }

  /**
   * Build relationship views for player perspective
   * Uses perceived values when available, hiding fear/resentment
   */
  private buildPlayerRelationships(
    state: FullGameState,
    characterId: string,
    relationships: Relationship[],
    perceivedRelationships: PerceivedRelationship[]
  ): PlayerRelationshipView[] {
    const result: PlayerRelationshipView[] = [];

    // Get relationships FROM this character
    const myRelationships = relationships.filter(
      r => r.from.id === characterId && r.from.type === 'character'
    );

    for (const rel of myRelationships) {
      // Find if there's a perceived version
      const perceived = perceivedRelationships.find(
        p => p.perceiverId === characterId && p.targetId === rel.to.id
      );

      // Find the target's name
      let targetName = 'Unknown';
      let targetType: 'character' | 'npc' = 'character';

      if (rel.to.type === 'character') {
        const char = state.characters.find(c => c.id === rel.to.id);
        if (char) targetName = char.name;
        targetType = 'character';
      } else if (rel.to.type === 'npc') {
        const npc = state.npcs.find(n => n.id === rel.to.id);
        if (npc) targetName = npc.name;
        targetType = 'npc';
      }

      result.push({
        targetId: rel.to.id,
        targetName,
        targetType,
        // Use perceived values if available, otherwise show true values for visible dimensions
        // Note: fear/resentment are NEVER shown to the perceiver
        perceivedTrust: perceived?.perceivedTrust ?? rel.trust,
        perceivedRespect: perceived?.perceivedRespect ?? rel.respect,
        perceivedAffection: perceived?.perceivedAffection ?? rel.affection,
      });
    }

    return result;
  }

  /**
   * Get perceived relationship for a character
   */
  getPerceivedRelationship(
    gameId: string,
    perceiverId: string,
    targetId: string
  ): PerceivedRelationship | null {
    return this.perceivedRelationshipRepo.findByPerceiverAndTarget(gameId, perceiverId, targetId);
  }

  /**
   * Get all perceived relationships for a character
   */
  getPerceivedRelationships(
    gameId: string,
    perceiverId: string
  ): PerceivedRelationship[] {
    return this.perceivedRelationshipRepo.findByPerceiver(gameId, perceiverId);
  }
}
