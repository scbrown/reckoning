/**
 * NPC Response Prompts
 *
 * Prompts for generating NPC actions and dialogue in response to party actions.
 */

import type { Area, NPC, CanonicalEvent } from '@reckoning/shared';
import { formatRecentEvents } from './utils.js';

/**
 * Context for NPC response generation
 */
export interface NPCContext {
  /** The NPC generating a response */
  npc: NPC;
  /** The event triggering the NPC's response */
  triggeringEvent: CanonicalEvent;
  /** Current location */
  currentArea: Area;
  /** Recent events for context */
  recentEvents: CanonicalEvent[];
}

/**
 * Build a prompt for generating NPC responses.
 *
 * Used when an NPC needs to react to party actions or dialogue.
 * Generates responses consistent with the NPC's personality and disposition.
 *
 * @param context - The NPC context including the NPC, triggering event, and recent history
 * @returns The formatted prompt string
 */
export function buildNPCPrompt(context: NPCContext): string {
  return `
Generate ${context.npc.name}'s response to the party.

NPC: ${context.npc.name}
Description: ${context.npc.description}
Disposition: ${context.npc.disposition}

Triggering Event:
${context.triggeringEvent.content}

Location: ${context.currentArea.name}

Recent Context:
${formatRecentEvents(context.recentEvents)}

Generate the NPC's reaction - action, dialogue, or both.
Use eventType: "npc_action" for actions, "npc_dialogue" for speech.
`.trim();
}
