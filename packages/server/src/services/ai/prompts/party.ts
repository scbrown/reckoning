/**
 * Party Action/Dialogue Prompts
 *
 * Prompts for generating party member actions and dialogue.
 */

import type { Area, Character, CanonicalEvent } from '@reckoning/shared';
import { formatRecentEvents } from './utils.js';

/**
 * Context for party action/dialogue generation
 */
export interface PartyContext {
  /** Party members */
  party: Character[];
  /** Current location */
  currentArea: Area;
  /** Recent events for context */
  recentEvents: CanonicalEvent[];
  /** Optional DM guidance or constraints */
  dmGuidance?: string;
}

/**
 * Build a prompt for generating party member actions or dialogue.
 *
 * Used to suggest what party members might do or say next.
 * The AI should pick a specific character and generate appropriate content.
 *
 * @param context - The party context including members, location, and recent events
 * @returns The formatted prompt string
 */
export function buildPartyPrompt(context: PartyContext): string {
  const partyText = context.party
    .map((c) => `- ${c.name}: ${c.description} (Class: ${c.class})`)
    .join('\n');

  return `
Generate the next party member action or dialogue.

Party Members:
${partyText}

Current Location: ${context.currentArea.name}

Recent Events:
${formatRecentEvents(context.recentEvents)}

${context.dmGuidance ? `DM Guidance: ${context.dmGuidance}` : ''}

Generate what a party member does or says next. Be specific about which character.
Use eventType: "party_action" for actions, "party_dialogue" for speech.
`.trim();
}
