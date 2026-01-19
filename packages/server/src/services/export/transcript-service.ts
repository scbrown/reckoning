/**
 * Transcript Service
 *
 * Generates transcripts from game event history.
 * Supports markdown and plain text output formats.
 */

import type { CanonicalEvent } from '@reckoning/shared/game';
import type { EventRepository } from '../../db/repositories/event-repository.js';
import type { SceneRepository, Scene } from '../../db/repositories/scene-repository.js';
import type { GameRepository } from '../../db/repositories/game-repository.js';
import type {
  TranscriptOptions,
  TranscriptSection,
  TranscriptEntry,
  Transcript,
} from './types.js';

/**
 * Default transcript options
 */
const DEFAULT_OPTIONS: TranscriptOptions = {
  format: 'markdown',
  includeSceneHeaders: true,
  includeTurnNumbers: false,
  includeTimestamps: false,
  dialogueOnly: false,
  formatDialogue: true,
};

/**
 * Event types that are considered dialogue
 */
const DIALOGUE_EVENT_TYPES = ['party_dialogue', 'npc_dialogue'];

/**
 * Service for generating transcripts from game events
 */
export class TranscriptService {
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
   * Generate a transcript for a game
   */
  generateTranscript(gameId: string, options?: Partial<TranscriptOptions>): Transcript {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const game = this.gameRepo.findById(gameId);

    if (!game) {
      throw new Error(`Game not found: ${gameId}`);
    }

    // Get game name (use ID prefix as fallback since GameState doesn't have name)
    const gameName = `Game ${gameId.slice(0, 8)}`;

    // Get all scenes for the game
    const allScenes = this.sceneRepo.findByGame(gameId, { limit: 1000 });

    // Filter scenes if specific IDs provided
    let scenes = opts.sceneIds
      ? allScenes.filter(s => opts.sceneIds!.includes(s.id))
      : allScenes;

    // Sort scenes by start turn
    scenes = scenes.sort((a, b) => a.startedTurn - b.startedTurn);

    // Build transcript sections
    const sections: TranscriptSection[] = [];
    let totalEvents = 0;

    if (scenes.length > 0) {
      // Generate sections from scenes
      for (const scene of scenes) {
        const section = this.buildSceneSection(scene, opts);
        if (section.entries.length > 0) {
          sections.push(section);
          totalEvents += section.entries.length;
        }
      }
    } else {
      // No scenes - generate a single section from all events
      const section = this.buildEventSection(gameId, opts);
      if (section.entries.length > 0) {
        sections.push(section);
        totalEvents = section.entries.length;
      }
    }

    return {
      gameId,
      gameName,
      exportedAt: new Date().toISOString(),
      sections,
      totalEvents,
    };
  }

  /**
   * Build a transcript section from a scene
   */
  private buildSceneSection(scene: Scene, opts: TranscriptOptions): TranscriptSection {
    // Get events in turn range
    let events = this.getEventsForScene(scene);

    // Apply filters
    events = this.applyFilters(events, opts);

    // Convert to entries
    const entries = events.map(e => this.eventToEntry(e));

    // Build section with required fields
    const section: TranscriptSection = {
      title: scene.name || `Scene ${scene.id.slice(0, 8)}`,
      sceneId: scene.id,
      startTurn: scene.startedTurn,
      entries,
    };

    // Add optional fields only if they have values
    if (scene.sceneType) {
      section.sceneType = scene.sceneType;
    }
    if (scene.mood) {
      section.mood = scene.mood;
    }
    if (scene.stakes) {
      section.stakes = scene.stakes;
    }
    if (scene.locationId) {
      section.locationId = scene.locationId;
    }
    if (scene.completedTurn !== null) {
      section.endTurn = scene.completedTurn;
    }

    return section;
  }

  /**
   * Build a transcript section from all events (when no scenes exist)
   */
  private buildEventSection(gameId: string, opts: TranscriptOptions): TranscriptSection {
    // Get all events
    let events = this.eventRepo.findByGame(gameId, { limit: 10000 });

    // Apply turn range filter
    if (opts.turnRange) {
      events = events.filter(
        e => e.turn >= opts.turnRange!.start && e.turn <= opts.turnRange!.end
      );
    }

    // Apply other filters
    events = this.applyFilters(events, opts);

    // Find turn range
    const turns = events.map(e => e.turn);
    const startTurn = Math.min(...turns);
    const endTurn = Math.max(...turns);

    // Convert to entries
    const entries = events.map(e => this.eventToEntry(e));

    return {
      title: 'Full Transcript',
      startTurn,
      endTurn,
      entries,
    };
  }

  /**
   * Get events for a scene based on turn range
   */
  private getEventsForScene(scene: Scene): CanonicalEvent[] {
    const events = this.eventRepo.findByGame(scene.gameId, { limit: 10000 });

    // Filter to scene turn range
    return events.filter(e => {
      if (e.turn < scene.startedTurn) return false;
      if (scene.completedTurn !== null && e.turn > scene.completedTurn) return false;
      return true;
    });
  }

  /**
   * Apply filtering options to events
   */
  private applyFilters(events: CanonicalEvent[], opts: TranscriptOptions): CanonicalEvent[] {
    let filtered = events;

    // Turn range filter
    if (opts.turnRange) {
      filtered = filtered.filter(
        e => e.turn >= opts.turnRange!.start && e.turn <= opts.turnRange!.end
      );
    }

    // Event type filter
    if (opts.eventTypes && opts.eventTypes.length > 0) {
      filtered = filtered.filter(e => opts.eventTypes!.includes(e.eventType));
    }

    // Dialogue-only filter
    if (opts.dialogueOnly) {
      filtered = filtered.filter(e => DIALOGUE_EVENT_TYPES.includes(e.eventType));
    }

    return filtered;
  }

  /**
   * Convert a canonical event to a transcript entry
   */
  private eventToEntry(event: CanonicalEvent): TranscriptEntry {
    const entry: TranscriptEntry = {
      eventId: event.id,
      turn: event.turn,
      timestamp: event.timestamp,
      eventType: event.eventType,
      content: event.content,
    };

    // Only set optional properties if they have values
    if (event.speaker) {
      entry.speaker = event.speaker;
    }
    if (event.action) {
      entry.action = event.action;
    }

    return entry;
  }

  /**
   * Render transcript to markdown format
   */
  renderMarkdown(transcript: Transcript, opts: TranscriptOptions): string {
    const lines: string[] = [];

    // Title
    lines.push(`# ${transcript.gameName}`);
    lines.push('');
    lines.push(`*Exported: ${new Date(transcript.exportedAt).toLocaleString()}*`);
    lines.push('');

    // Table of contents
    if (transcript.sections.length > 1) {
      lines.push('## Table of Contents');
      lines.push('');
      for (const section of transcript.sections) {
        const anchor = this.slugify(section.title);
        lines.push(`- [${section.title}](#${anchor})`);
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    // Sections
    for (const section of transcript.sections) {
      if (opts.includeSceneHeaders !== false) {
        lines.push(`## ${section.title}`);
        lines.push('');

        // Scene metadata
        if (section.sceneType || section.mood || section.stakes) {
          const meta: string[] = [];
          if (section.sceneType) meta.push(`*${section.sceneType}*`);
          if (section.mood) meta.push(`Mood: ${section.mood}`);
          if (section.stakes) meta.push(`Stakes: ${section.stakes}`);
          lines.push(meta.join(' | '));
          lines.push('');
        }
      }

      // Entries
      for (const entry of section.entries) {
        const line = this.formatEntryMarkdown(entry, opts);
        lines.push(line);
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Render transcript to plain text format
   */
  renderPlainText(transcript: Transcript, opts: TranscriptOptions): string {
    const lines: string[] = [];

    // Title
    lines.push(transcript.gameName.toUpperCase());
    lines.push('='.repeat(transcript.gameName.length));
    lines.push('');
    lines.push(`Exported: ${new Date(transcript.exportedAt).toLocaleString()}`);
    lines.push('');

    // Sections
    for (const section of transcript.sections) {
      if (opts.includeSceneHeaders !== false) {
        lines.push('-'.repeat(60));
        lines.push(section.title.toUpperCase());
        if (section.sceneType) {
          lines.push(`(${section.sceneType})`);
        }
        lines.push('-'.repeat(60));
        lines.push('');
      }

      // Entries
      for (const entry of section.entries) {
        const line = this.formatEntryPlainText(entry, opts);
        lines.push(line);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Format a single entry for markdown output
   */
  private formatEntryMarkdown(entry: TranscriptEntry, opts: TranscriptOptions): string {
    const parts: string[] = [];

    // Turn/timestamp prefix
    if (opts.includeTurnNumbers) {
      parts.push(`**[Turn ${entry.turn}]**`);
    }
    if (opts.includeTimestamps) {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      parts.push(`*${time}*`);
    }

    // Content formatting based on event type
    if (opts.formatDialogue && entry.speaker) {
      // Dialogue format
      parts.push(`**${entry.speaker}:** "${entry.content}"`);
    } else if (entry.eventType === 'narration') {
      // Narration in italics
      parts.push(`*${entry.content}*`);
    } else if (entry.eventType === 'environment') {
      // Environment in brackets
      parts.push(`[${entry.content}]`);
    } else if (entry.eventType === 'dm_injection') {
      // DM text in blockquote
      parts.push(`> ${entry.content}`);
    } else {
      parts.push(entry.content);
    }

    return parts.join(' ');
  }

  /**
   * Format a single entry for plain text output
   */
  private formatEntryPlainText(entry: TranscriptEntry, opts: TranscriptOptions): string {
    const parts: string[] = [];

    // Turn/timestamp prefix
    if (opts.includeTurnNumbers) {
      parts.push(`[Turn ${entry.turn}]`);
    }
    if (opts.includeTimestamps) {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      parts.push(`(${time})`);
    }

    // Content formatting based on event type
    if (opts.formatDialogue && entry.speaker) {
      // Dialogue format
      parts.push(`${entry.speaker}: "${entry.content}"`);
    } else if (entry.eventType === 'environment') {
      // Environment in brackets
      parts.push(`[${entry.content}]`);
    } else {
      parts.push(entry.content);
    }

    return parts.join(' ');
  }

  /**
   * Convert a string to a URL-safe slug
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Generate transcript as a string in the requested format
   */
  generate(gameId: string, options?: Partial<TranscriptOptions>): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const transcript = this.generateTranscript(gameId, opts);

    if (opts.format === 'plain') {
      return this.renderPlainText(transcript, opts);
    }

    return this.renderMarkdown(transcript, opts);
  }
}
