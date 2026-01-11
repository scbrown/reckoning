/**
 * World Generation Prompts
 *
 * Prompts for generating initial game worlds based on party composition.
 */

import type { Party, Character } from '@reckoning/shared/game';

/**
 * Context needed for world generation
 */
export interface WorldGenerationContext {
  /** The party for whom the world is being generated */
  party: Party;
  /** Optional theme hint from the user */
  theme?: string;
  /** Optional number of areas to generate (default 3) */
  areaCount?: number;
}

/**
 * System prompt for world generation
 */
export const WORLD_GENERATION_SYSTEM_PROMPT = `You are a world-builder AI assistant for "The Reckoning" RPG.

Your role:
- Create an immersive starting world tailored to the party's composition
- Generate interconnected areas with logical exits
- Populate areas with interesting NPCs and interactable objects
- Provide story hooks that tie into character backgrounds

Output Format:
Always respond with valid JSON matching the world_generation schema:
{
  "worldName": "Name of the world/setting",
  "worldDescription": "Brief atmospheric description",
  "startingAreaId": "area-1",
  "areas": [
    {
      "id": "area-1",
      "name": "Area Name",
      "description": "Detailed description for players",
      "exits": [{ "direction": "north", "targetAreaId": "area-2", "description": "..." }],
      "objects": [{ "id": "obj-1", "name": "...", "description": "...", "interactable": true, "tags": [] }],
      "npcs": [{ "id": "npc-1", "name": "...", "description": "...", "disposition": "neutral", "tags": [] }],
      "tags": ["starting", "town"]
    }
  ],
  "storyHooks": ["Potential adventure hooks..."]
}

Guidelines:
- Tailor the world to party composition (classes, backgrounds, descriptions)
- Create a cohesive setting that feels lived-in
- Include 2-3 story hooks that could involve different party members
- NPCs should have distinct personalities and potential for interaction
- Objects should offer exploration opportunities
- Use consistent ID naming: area-N, obj-N, npc-N`;

/**
 * Format a character for the prompt
 */
function formatCharacter(char: Character): string {
  const parts = [char.name];
  if (char.class) {
    parts.push(`(${char.class})`);
  }
  if (char.description) {
    parts.push(`- ${char.description}`);
  }
  return parts.join(' ');
}

/**
 * Build the user prompt for world generation
 *
 * @param context - World generation context with party info
 * @returns The formatted user prompt
 */
export function buildWorldGenerationPrompt(context: WorldGenerationContext): string {
  const { party, theme, areaCount = 3 } = context;

  const partySection = party.members.length > 0
    ? `## The Party

${party.members.map(formatCharacter).join('\n')}`
    : '## The Party\n\nNo characters defined yet.';

  const themeSection = theme
    ? `## Requested Theme

${theme}`
    : '';

  const prompt = `Generate a starting world for a new adventure.

${partySection}

${themeSection}

## Requirements

1. Create ${areaCount} interconnected areas
2. The starting area should be safe and provide clear directions
3. Include at least 1 NPC in the starting area
4. Add 2-3 interactable objects across all areas
5. Provide 2-3 story hooks related to the party members
6. All exits should link to valid area IDs you create
7. Use unique IDs for all areas, objects, and NPCs

Generate a world that feels tailored to this specific party.`;

  return prompt;
}

/**
 * Build the complete prompt for world generation
 *
 * @param context - World generation context
 * @returns Object with system prompt, user prompt, and combined
 */
export function buildWorldPrompt(context: WorldGenerationContext): {
  systemPrompt: string;
  userPrompt: string;
  combined: string;
} {
  const systemPrompt = WORLD_GENERATION_SYSTEM_PROMPT;
  const userPrompt = buildWorldGenerationPrompt(context);
  const combined = `${systemPrompt}\n\n---\n\n${userPrompt}`;

  return {
    systemPrompt,
    userPrompt,
    combined,
  };
}
