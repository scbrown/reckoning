/**
 * Comic Service
 *
 * Generates comic panel layouts from game event history.
 * Handles scene selection, panel composition, and layout decisions.
 */

import { randomUUID } from 'crypto';
import type { CanonicalEvent } from '@reckoning/shared/game';
import type { EventRepository } from '../../db/repositories/event-repository.js';
import type { SceneRepository, Scene } from '../../db/repositories/scene-repository.js';
import type { GameRepository } from '../../db/repositories/game-repository.js';
import type {
  ComicOptions,
  ComicLayout,
  ComicPage,
  ComicPanel,
  PanelLayout,
} from './types.js';

/**
 * Default comic options
 */
const DEFAULT_OPTIONS: ComicOptions = {
  sceneIds: [],
  panelsPerPage: 4,
  includeChapterTitles: true,
  maxPanelsPerScene: 12,
  selectionStrategy: 'highlights',
};

/**
 * Event types that are considered high-impact for panel selection
 */
const HIGH_IMPACT_EVENT_TYPES = [
  'party_action',
  'npc_action',
  'party_dialogue',
  'npc_dialogue',
];

/**
 * Actions that are visually interesting for comics
 */
const VISUAL_ACTIONS = [
  'attack',
  'defend',
  'move',
  'flee',
  'intimidate',
  'persuade',
  'help',
  'heal',
  'steal',
  'sneak',
  'investigate',
  'observe',
  'confront',
];

/**
 * Service for generating comic layouts from game events
 */
export class ComicService {
  private eventRepo: EventRepository;
  private sceneRepo: SceneRepository;
  private gameRepo: GameRepository;

  constructor(
    eventRepo: EventRepository,
    sceneRepo: SceneRepository,
    gameRepo: GameRepository
  ) {
    this.eventRepo = eventRepo;
    this.sceneRepo = sceneRepo;
    this.gameRepo = gameRepo;
  }

  /**
   * Generate a comic layout for selected scenes
   */
  generateLayout(gameId: string, options?: Partial<ComicOptions>): ComicLayout {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const game = this.gameRepo.findById(gameId);

    if (!game) {
      throw new Error(`Game not found: ${gameId}`);
    }

    // Get game name (use ID prefix as fallback since GameState doesn't have name)
    const gameName = `Game ${gameId.slice(0, 8)}`;

    // Get scenes to include
    let scenes: Scene[];
    if (opts.sceneIds && opts.sceneIds.length > 0) {
      scenes = opts.sceneIds
        .map(id => this.sceneRepo.findById(id))
        .filter((s): s is Scene => s !== null);
    } else {
      // If no scenes specified, get all completed scenes
      scenes = this.sceneRepo
        .findByGame(gameId, { limit: 100 })
        .filter(s => s.status === 'completed');
    }

    // Sort by start turn
    scenes.sort((a, b) => a.startedTurn - b.startedTurn);

    // Generate pages
    const pages: ComicPage[] = [];
    let pageNumber = 1;

    for (const scene of scenes) {
      // Add chapter title page if enabled
      if (opts.includeChapterTitles && scene.name) {
        pages.push({
          pageNumber: pageNumber++,
          layout: 'single',
          panels: [],
          chapterTitle: scene.name,
        });
      }

      // Get events for this scene
      const events = this.getEventsForScene(scene);

      // Select events for panels based on strategy
      const selectedEvents = this.selectEvents(events, opts);

      // Generate panels from selected events
      const panels = selectedEvents.map(e => this.eventToPanel(e, scene));

      // Layout panels into pages
      const scenePages = this.layoutPanels(panels, opts.panelsPerPage!, pageNumber);
      pages.push(...scenePages);
      pageNumber += scenePages.length;
    }

    // Calculate totals
    const totalPanels = pages.reduce((sum, p) => sum + p.panels.length, 0);

    return {
      gameId,
      gameName,
      exportedAt: new Date().toISOString(),
      pages,
      totalPages: pages.length,
      totalPanels,
    };
  }

  /**
   * Get available scenes for comic generation
   */
  getAvailableScenes(gameId: string): Scene[] {
    return this.sceneRepo.findByGame(gameId, { limit: 100 });
  }

  /**
   * Preview panels for a single scene without full layout
   */
  previewScenePanels(sceneId: string, options?: Partial<ComicOptions>): ComicPanel[] {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const scene = this.sceneRepo.findById(sceneId);

    if (!scene) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    const events = this.getEventsForScene(scene);
    const selectedEvents = this.selectEvents(events, opts);

    return selectedEvents.map(e => this.eventToPanel(e, scene));
  }

  /**
   * Get events for a scene based on turn range
   */
  private getEventsForScene(scene: Scene): CanonicalEvent[] {
    const events = this.eventRepo.findByGame(scene.gameId, { limit: 10000 });

    return events.filter(e => {
      if (e.turn < scene.startedTurn) return false;
      if (scene.completedTurn !== null && e.turn > scene.completedTurn) return false;
      return true;
    });
  }

  /**
   * Select events for panels based on strategy
   */
  private selectEvents(
    events: CanonicalEvent[],
    opts: ComicOptions
  ): CanonicalEvent[] {
    const maxPanels = opts.maxPanelsPerScene!;

    switch (opts.selectionStrategy) {
      case 'all':
        return events.slice(0, maxPanels);

      case 'dialogue':
        return this.selectDialogueEvents(events, maxPanels);

      case 'highlights':
      default:
        return this.selectHighlightEvents(events, maxPanels);
    }
  }

  /**
   * Select dialogue-focused events
   */
  private selectDialogueEvents(
    events: CanonicalEvent[],
    maxPanels: number
  ): CanonicalEvent[] {
    // Prioritize dialogue events
    const dialogueEvents = events.filter(
      e => e.eventType === 'party_dialogue' || e.eventType === 'npc_dialogue'
    );

    // If not enough dialogue, add narration for context
    if (dialogueEvents.length < maxPanels) {
      const narrationEvents = events.filter(
        e => e.eventType === 'narration'
      );
      const combined = [...dialogueEvents];

      // Interleave some narration events
      for (const ne of narrationEvents) {
        if (combined.length >= maxPanels) break;
        combined.push(ne);
      }

      return combined.sort((a, b) => a.turn - b.turn || a.timestamp.localeCompare(b.timestamp)).slice(0, maxPanels);
    }

    return dialogueEvents.slice(0, maxPanels);
  }

  /**
   * Select highlight events (most visually interesting)
   */
  private selectHighlightEvents(
    events: CanonicalEvent[],
    maxPanels: number
  ): CanonicalEvent[] {
    // Score each event
    const scored = events.map(e => ({
      event: e,
      score: this.scoreEvent(e),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Take top events
    const selected = scored.slice(0, maxPanels).map(s => s.event);

    // Re-sort by chronological order
    return selected.sort(
      (a, b) => a.turn - b.turn || a.timestamp.localeCompare(b.timestamp)
    );
  }

  /**
   * Score an event for panel selection
   */
  private scoreEvent(event: CanonicalEvent): number {
    let score = 0;

    // High-impact event types
    if (HIGH_IMPACT_EVENT_TYPES.includes(event.eventType)) {
      score += 5;
    }

    // Visual actions
    if (event.action && VISUAL_ACTIONS.includes(event.action)) {
      score += 10;
    }

    // Dialogue events with speaker
    if (event.speaker) {
      score += 3;
    }

    // Events with targets (interaction)
    if (event.targetId) {
      score += 4;
    }

    // Combat-related tags
    if (event.tags?.some((t: string) => ['combat', 'confrontation', 'dramatic'].includes(t))) {
      score += 6;
    }

    // Consequence tags
    if (event.tags?.some((t: string) => ['consequence', 'revelation', 'climax'].includes(t))) {
      score += 8;
    }

    // Penalize environment events slightly
    if (event.eventType === 'environment') {
      score -= 2;
    }

    return score;
  }

  /**
   * Convert an event to a comic panel
   */
  private eventToPanel(event: CanonicalEvent, scene: Scene): ComicPanel {
    // Generate panel description
    const description = this.generatePanelDescription(event, scene);

    // Extract characters mentioned
    const characters = this.extractCharacters(event);

    // Build the base panel
    const panel: ComicPanel = {
      id: randomUUID(),
      eventId: event.id,
      content: event.content,
      description,
      characters,
      locationId: event.locationId,
    };

    // Add optional dialogue if present
    if (event.speaker && (event.eventType === 'party_dialogue' || event.eventType === 'npc_dialogue')) {
      panel.dialogue = {
        speaker: event.speaker,
        text: this.extractDialogueText(event.content),
      };
    }

    // Add optional mood
    if (scene.mood) {
      panel.mood = scene.mood;
    }

    // Add optional action
    if (event.action) {
      panel.action = event.action;
    }

    return panel;
  }

  /**
   * Extract dialogue text from content (removing action descriptions)
   */
  private extractDialogueText(content: string): string {
    // Try to extract quoted text
    const quoteMatch = content.match(/"([^"]+)"/);
    if (quoteMatch && quoteMatch[1]) {
      return quoteMatch[1];
    }

    // Try to extract text after colon
    const colonMatch = content.match(/:\s*(.+)/);
    if (colonMatch && colonMatch[1]) {
      return colonMatch[1].replace(/^["']|["']$/g, '');
    }

    return content;
  }

  /**
   * Generate a description for panel artwork
   */
  private generatePanelDescription(event: CanonicalEvent, scene: Scene): string {
    const parts: string[] = [];

    // Location context
    if (scene.mood) {
      parts.push(`${scene.mood} atmosphere`);
    }

    // Action description
    if (event.action) {
      parts.push(`Action: ${event.action}`);
    }

    // Event type context
    switch (event.eventType) {
      case 'party_action':
        parts.push('Focus on player character action');
        break;
      case 'npc_action':
        parts.push('Focus on NPC action');
        break;
      case 'party_dialogue':
      case 'npc_dialogue':
        parts.push('Dialogue scene with speech bubble');
        break;
      case 'narration':
        parts.push('Establishing shot or scene-setting panel');
        break;
      case 'environment':
        parts.push('Environmental detail panel');
        break;
    }

    // Content summary (truncated)
    const summary = event.content.length > 100
      ? event.content.slice(0, 100) + '...'
      : event.content;
    parts.push(`Scene: ${summary}`);

    return parts.join('. ');
  }

  /**
   * Extract character IDs/names from an event
   */
  private extractCharacters(event: CanonicalEvent): string[] {
    const characters: string[] = [];

    // Add actor
    if (event.actorId) {
      characters.push(event.actorId);
    }

    // Add target if it's a character/NPC
    if (event.targetId && (event.targetType === 'character' || event.targetType === 'npc' || event.targetType === 'player')) {
      characters.push(event.targetId);
    }

    // Add witnesses
    if (event.witnesses) {
      characters.push(...event.witnesses);
    }

    // Deduplicate
    return [...new Set(characters)];
  }

  /**
   * Layout panels into pages
   */
  private layoutPanels(
    panels: ComicPanel[],
    panelsPerPage: number,
    startPageNumber: number
  ): ComicPage[] {
    const pages: ComicPage[] = [];
    let pageNumber = startPageNumber;
    let currentPanels: ComicPanel[] = [];

    for (const panel of panels) {
      currentPanels.push(panel);

      if (currentPanels.length >= panelsPerPage) {
        pages.push({
          pageNumber: pageNumber++,
          layout: this.chooseLayout(currentPanels.length),
          panels: currentPanels,
        });
        currentPanels = [];
      }
    }

    // Handle remaining panels
    if (currentPanels.length > 0) {
      pages.push({
        pageNumber: pageNumber++,
        layout: this.chooseLayout(currentPanels.length),
        panels: currentPanels,
      });
    }

    return pages;
  }

  /**
   * Choose panel layout based on number of panels
   */
  private chooseLayout(panelCount: number): PanelLayout {
    switch (panelCount) {
      case 1:
        return 'single';
      case 2:
        return 'half';
      case 3:
        return 'thirds';
      case 4:
        return 'quarter';
      default:
        return panelCount <= 3 ? 'strip' : 'quarter';
    }
  }
}
