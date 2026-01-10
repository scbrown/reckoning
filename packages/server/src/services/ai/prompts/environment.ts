/**
 * Environment Event Prompts
 *
 * Prompts for generating environmental events and atmospheric details.
 */

import type { Area, CanonicalEvent } from '@reckoning/shared';
import { formatRecentEvents } from './utils.js';

/**
 * Types of triggers for environment events
 */
export type EnvironmentTrigger =
  | 'time_passage'
  | 'consequence'
  | 'random'
  | 'atmosphere';

/**
 * Context for environment event generation
 */
export interface EnvironmentContext {
  /** Current location */
  currentArea: Area;
  /** Recent events for context */
  recentEvents: CanonicalEvent[];
  /** What triggered the environment event */
  trigger?: EnvironmentTrigger;
}

/**
 * Build a prompt for generating environment events.
 *
 * Used to add atmospheric details, consequences of actions, or ambient events.
 * Creates immersion through sounds, weather, and environmental reactions.
 *
 * @param context - The environment context including location and recent events
 * @returns The formatted prompt string
 */
export function buildEnvironmentPrompt(context: EnvironmentContext): string {
  const tagsText = context.currentArea.tags.join(', ') || 'None';

  return `
Generate an environmental event or atmospheric detail.

Location: ${context.currentArea.name}
${context.currentArea.description}

Tags: ${tagsText}

Trigger: ${context.trigger || 'atmosphere'}

Recent Events:
${formatRecentEvents(context.recentEvents)}

Generate something happening in the environment - sounds, weather, ambient details, or consequences of recent actions.
Use eventType: "environment".
`.trim();
}
