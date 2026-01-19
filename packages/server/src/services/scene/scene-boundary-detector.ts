import type { EventRepository } from '../../db/repositories/event-repository.js';
import type { SceneRepository, Scene } from '../../db/repositories/scene-repository.js';
import type { CanonicalEvent } from '@reckoning/shared/game';
import type {
  BoundarySuggestion,
  BoundarySignal,
  BoundaryDetectionConfig,
} from './types.js';
import { VIOLENCE_ACTIONS, MERCY_ACTIONS } from '@reckoning/shared/game';

/**
 * Default configuration values for boundary detection
 */
const DEFAULT_CONFIG: Required<BoundaryDetectionConfig> = {
  confidenceThreshold: 0.6,
  longDurationTurns: 8,
  longDurationEvents: 15,
  locationChangeWeight: 0.9,
  confrontationResolvedWeight: 0.8,
  moodShiftWeight: 0.6,
  longDurationWeight: 0.4,
  recentEventWindow: 10,
};

/**
 * Tags that indicate a confrontation has ended
 */
const CONFRONTATION_END_TAGS = [
  'confrontation_end',
  'battle_end',
  'combat_end',
  'conflict_resolved',
  'peace_made',
];

/**
 * Tags that indicate a confrontation is ongoing
 */
const CONFRONTATION_TAGS = [
  'confrontation',
  'battle',
  'combat',
  'conflict',
  'fight',
];

/**
 * Dependencies for SceneBoundaryDetector
 */
export interface SceneBoundaryDetectorDeps {
  eventRepo: EventRepository;
  sceneRepo: SceneRepository;
}

/**
 * Analyzes game events to suggest scene boundaries.
 *
 * This service is advisory only - it provides suggestions but does not
 * automatically trigger scene changes. The DM or game engine can use
 * these suggestions to prompt for scene transitions.
 *
 * Detection signals:
 * - Location change: Party moved to a new area
 * - Confrontation resolved: Combat/conflict ended with mercy or defeat
 * - Mood shift: Significant change in event types/tone
 * - Long duration: Scene has been running for many turns/events
 */
export class SceneBoundaryDetector {
  private eventRepo: EventRepository;
  private sceneRepo: SceneRepository;
  private config: Required<BoundaryDetectionConfig>;

  constructor(deps: SceneBoundaryDetectorDeps, config?: BoundaryDetectionConfig) {
    this.eventRepo = deps.eventRepo;
    this.sceneRepo = deps.sceneRepo;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze the current scene and suggest whether a boundary should occur.
   *
   * @param gameId - The game to analyze
   * @param currentTurn - The current turn number
   * @returns Boundary suggestion with signals and confidence
   */
  analyze(gameId: string, currentTurn: number): BoundarySuggestion {
    const currentScene = this.sceneRepo.findActive(gameId);

    // If no active scene, return no suggestion
    if (!currentScene) {
      return this.createEmptySuggestion(gameId, currentTurn);
    }

    // Get recent events for analysis, sorted by turn for reliable ordering
    const recentEvents = this.eventRepo.getRecentContext(
      gameId,
      this.config.recentEventWindow
    ).sort((a, b) => a.turn - b.turn);

    // Collect all signals
    const signals: BoundarySignal[] = [];

    // Check for location change
    const locationSignal = this.detectLocationChange(currentScene, recentEvents);
    if (locationSignal) {
      signals.push(locationSignal);
    }

    // Check for confrontation resolution
    const confrontationSignal = this.detectConfrontationResolved(recentEvents);
    if (confrontationSignal) {
      signals.push(confrontationSignal);
    }

    // Check for mood shift
    const moodSignal = this.detectMoodShift(currentScene, recentEvents);
    if (moodSignal) {
      signals.push(moodSignal);
    }

    // Check for long duration
    const eventCount = this.sceneRepo.countEventsInScene(currentScene.id);
    const durationSignal = this.detectLongDuration(
      currentScene,
      currentTurn,
      eventCount
    );
    if (durationSignal) {
      signals.push(durationSignal);
    }

    // Calculate overall confidence
    const confidence = this.calculateConfidence(signals);

    // Get current location from most recent event
    const currentLocationId = recentEvents.length > 0
      ? recentEvents[recentEvents.length - 1].locationId
      : currentScene.locationId;

    return {
      shouldEndScene: confidence >= this.config.confidenceThreshold,
      confidence,
      signals,
      sceneContext: {
        sceneId: currentScene.id,
        currentTurn,
        startedTurn: currentScene.startedTurn,
        eventCount,
        currentLocationId,
        currentMood: currentScene.mood,
      },
    };
  }

  /**
   * Detect if the party has moved to a new location.
   */
  private detectLocationChange(
    scene: Scene,
    recentEvents: CanonicalEvent[]
  ): BoundarySignal | null {
    if (recentEvents.length === 0) {
      return null;
    }

    // Check for enter_location action in recent events
    const locationChangeEvent = recentEvents.find(
      (e) => e.action === 'enter_location'
    );

    if (locationChangeEvent) {
      return {
        type: 'location_change',
        strength: this.config.locationChangeWeight,
        reason: 'Party entered a new location',
        triggerEventId: locationChangeEvent.id,
      };
    }

    // Check if most recent event's location differs from scene's starting location
    const lastEvent = recentEvents[recentEvents.length - 1];
    if (scene.locationId && lastEvent.locationId !== scene.locationId) {
      // Check if this location change is recent (in last few events)
      const recentLocationChange = this.findLocationTransition(recentEvents, scene.locationId);
      if (recentLocationChange) {
        return {
          type: 'location_change',
          strength: this.config.locationChangeWeight * 0.8, // Slightly lower since not explicit
          reason: `Location changed from scene start (${scene.locationId} to ${lastEvent.locationId})`,
          triggerEventId: recentLocationChange.id,
        };
      }
    }

    return null;
  }

  /**
   * Find the event where location transitioned from the scene's starting location.
   */
  private findLocationTransition(
    events: CanonicalEvent[],
    sceneLocationId: string
  ): CanonicalEvent | null {
    let previousLocation = sceneLocationId;

    for (const event of events) {
      if (event.locationId !== previousLocation) {
        return event;
      }
      previousLocation = event.locationId;
    }

    return null;
  }

  /**
   * Detect if a confrontation has been resolved.
   */
  private detectConfrontationResolved(
    recentEvents: CanonicalEvent[]
  ): BoundarySignal | null {
    if (recentEvents.length === 0) {
      return null;
    }

    // Look for explicit confrontation_end tags
    const endTagEvent = recentEvents.find(
      (e) => e.tags?.some((tag) => CONFRONTATION_END_TAGS.includes(tag))
    );

    if (endTagEvent) {
      return {
        type: 'confrontation_resolved',
        strength: this.config.confrontationResolvedWeight,
        reason: 'Confrontation explicitly ended',
        triggerEventId: endTagEvent.id,
      };
    }

    // Look for pattern: violence actions followed by mercy actions
    const hasRecentViolence = recentEvents.some(
      (e) => e.action && (VIOLENCE_ACTIONS as readonly string[]).includes(e.action)
    );
    const hasRecentMercy = recentEvents.some(
      (e) => e.action && (MERCY_ACTIONS as readonly string[]).includes(e.action)
    );

    // Check if violence was followed by mercy (resolution pattern)
    if (hasRecentViolence && hasRecentMercy) {
      const lastViolenceIndex = this.findLastIndex(
        recentEvents,
        (e) => e.action && (VIOLENCE_ACTIONS as readonly string[]).includes(e.action)
      );
      const lastMercyIndex = this.findLastIndex(
        recentEvents,
        (e) => e.action && (MERCY_ACTIONS as readonly string[]).includes(e.action)
      );

      // Mercy came after violence - confrontation may be resolved
      if (lastMercyIndex > lastViolenceIndex) {
        const mercyEvent = recentEvents[lastMercyIndex];
        return {
          type: 'confrontation_resolved',
          strength: this.config.confrontationResolvedWeight * 0.7,
          reason: 'Violence followed by mercy action suggests resolution',
          triggerEventId: mercyEvent?.id,
        };
      }
    }

    // Check for confrontation tag that hasn't ended
    const hasOngoingConfrontation = recentEvents.some(
      (e) => e.tags?.some((tag) => CONFRONTATION_TAGS.includes(tag))
    );

    // If there was violence but no ongoing confrontation markers in recent events,
    // the confrontation may have naturally concluded
    if (hasRecentViolence && !hasOngoingConfrontation) {
      // Only suggest if the last event isn't a violence action
      const lastEvent = recentEvents[recentEvents.length - 1];
      if (!lastEvent.action || !(VIOLENCE_ACTIONS as readonly string[]).includes(lastEvent.action)) {
        return {
          type: 'confrontation_resolved',
          strength: this.config.confrontationResolvedWeight * 0.5,
          reason: 'Violence occurred but no ongoing confrontation markers',
        };
      }
    }

    return null;
  }

  /**
   * Detect if the scene mood has significantly shifted.
   */
  private detectMoodShift(
    scene: Scene,
    recentEvents: CanonicalEvent[]
  ): BoundarySignal | null {
    if (!scene.mood || recentEvents.length < 3) {
      return null;
    }

    // Analyze event types to infer current mood
    const inferredMood = this.inferMoodFromEvents(recentEvents);
    if (!inferredMood) {
      return null;
    }

    // Compare inferred mood with scene's declared mood
    if (this.areMoodsContrasting(scene.mood, inferredMood)) {
      return {
        type: 'mood_shift',
        strength: this.config.moodShiftWeight,
        reason: `Scene mood (${scene.mood}) contrasts with recent events (${inferredMood})`,
      };
    }

    return null;
  }

  /**
   * Infer the current mood from recent events.
   */
  private inferMoodFromEvents(events: CanonicalEvent[]): string | null {
    // Count event types and actions to infer mood
    let violenceCount = 0;
    let mercyCount = 0;
    let socialCount = 0;
    let explorationCount = 0;

    for (const event of events) {
      if (event.action) {
        if ((VIOLENCE_ACTIONS as readonly string[]).includes(event.action)) {
          violenceCount++;
        } else if ((MERCY_ACTIONS as readonly string[]).includes(event.action)) {
          mercyCount++;
        } else if (['persuade', 'befriend', 'help', 'bribe', 'intimidate'].includes(event.action)) {
          socialCount++;
        } else if (['enter_location', 'examine', 'search', 'unlock'].includes(event.action)) {
          explorationCount++;
        }
      }

      // Also check event types
      if (event.eventType === 'npc_dialogue' || event.eventType === 'party_dialogue') {
        socialCount++;
      }
    }

    const total = violenceCount + mercyCount + socialCount + explorationCount;
    if (total === 0) {
      return null;
    }

    // Determine dominant mood
    if (violenceCount > total * 0.4) return 'action';
    if (mercyCount > total * 0.3) return 'peaceful';
    if (socialCount > total * 0.4) return 'emotional';
    if (explorationCount > total * 0.4) return 'mysterious';

    return null;
  }

  /**
   * Check if two moods are contrasting (significant shift).
   */
  private areMoodsContrasting(mood1: string, mood2: string): boolean {
    const contrastingPairs: [string, string][] = [
      ['action', 'peaceful'],
      ['tense', 'peaceful'],
      ['tense', 'comedic'],
      ['action', 'emotional'],
      ['ominous', 'comedic'],
    ];

    return contrastingPairs.some(
      ([a, b]) =>
        (mood1 === a && mood2 === b) || (mood1 === b && mood2 === a)
    );
  }

  /**
   * Detect if the scene has been running for a long time.
   */
  private detectLongDuration(
    scene: Scene,
    currentTurn: number,
    eventCount: number
  ): BoundarySignal | null {
    const turnsDuration = currentTurn - scene.startedTurn;

    // Check turn-based duration
    if (turnsDuration >= this.config.longDurationTurns) {
      // Scale strength based on how far past threshold
      const overTurns = turnsDuration - this.config.longDurationTurns;
      const turnStrength = Math.min(
        this.config.longDurationWeight * (1 + overTurns * 0.1),
        1.0
      );

      return {
        type: 'long_duration',
        strength: turnStrength,
        reason: `Scene has lasted ${turnsDuration} turns (threshold: ${this.config.longDurationTurns})`,
      };
    }

    // Check event-based duration
    if (eventCount >= this.config.longDurationEvents) {
      const overEvents = eventCount - this.config.longDurationEvents;
      const eventStrength = Math.min(
        this.config.longDurationWeight * (1 + overEvents * 0.05),
        1.0
      );

      return {
        type: 'long_duration',
        strength: eventStrength,
        reason: `Scene has ${eventCount} events (threshold: ${this.config.longDurationEvents})`,
      };
    }

    return null;
  }

  /**
   * Calculate overall confidence from signals.
   */
  private calculateConfidence(signals: BoundarySignal[]): number {
    if (signals.length === 0) {
      return 0;
    }

    // Use weighted combination - highest signal dominates but others contribute
    const sortedStrengths = signals.map((s) => s.strength).sort((a, b) => b - a);

    // Primary signal gets full weight, subsequent signals get diminishing weights
    let confidence = 0;
    let weight = 1.0;

    for (const strength of sortedStrengths) {
      confidence += strength * weight;
      weight *= 0.3; // Each subsequent signal contributes 30% as much
    }

    // Cap at 1.0
    return Math.min(confidence, 1.0);
  }

  /**
   * Create an empty suggestion when no scene is active.
   */
  private createEmptySuggestion(
    gameId: string,
    currentTurn: number
  ): BoundarySuggestion {
    return {
      shouldEndScene: false,
      confidence: 0,
      signals: [],
      sceneContext: {
        sceneId: '',
        currentTurn,
        startedTurn: 0,
        eventCount: 0,
        currentLocationId: null,
        currentMood: null,
      },
    };
  }

  /**
   * Find the last index of an element matching a predicate.
   */
  private findLastIndex<T>(
    array: T[],
    predicate: (item: T) => boolean
  ): number {
    for (let i = array.length - 1; i >= 0; i--) {
      if (predicate(array[i])) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Update configuration thresholds at runtime.
   */
  updateConfig(config: Partial<BoundaryDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration.
   */
  getConfig(): Required<BoundaryDetectionConfig> {
    return { ...this.config };
  }
}
