/**
 * Scene Description Prompts
 *
 * Prompts for generating scene descriptions when the party enters a new area.
 */

import type { Area, NPC } from '@reckoning/shared';

/**
 * Context for scene description generation
 */
export interface SceneContext {
  /** The area being described */
  area: Area;
  /** NPCs present in the area */
  npcs: NPC[];
  /** Whether this is the party's first visit to this area */
  isFirstVisit: boolean;
  /** Optional time of day for atmospheric details */
  timeOfDay?: string;
}

/**
 * Build a prompt for generating scene descriptions.
 *
 * Used when the party enters a new area or revisits a location.
 * Generates atmospheric narration describing what the party sees.
 *
 * @param context - The scene context including area and additional details
 * @returns The formatted prompt string
 */
export function buildScenePrompt(context: SceneContext): string {
  const { area } = context;
  const exitsText = area.exits
    .map((e) => `${e.direction}: ${e.description}`)
    .join(', ');
  const objectsText = area.objects.map((o) => o.name).join(', ') || 'None';
  const npcsText =
    context.npcs.map((n) => `${n.name} (${n.disposition})`).join(', ') || 'None';

  return `
Describe the scene for the party entering: ${area.name}

Location Details:
${area.description}

Exits: ${exitsText}
Objects: ${objectsText}
NPCs Present: ${npcsText}

First visit: ${context.isFirstVisit ? 'Yes' : 'No'}
${context.timeOfDay ? `Time: ${context.timeOfDay}` : ''}

Generate an atmospheric description of this location. Use eventType: "narration".
`.trim();
}
