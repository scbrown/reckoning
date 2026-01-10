/**
 * Prompt Utilities
 *
 * Helper functions shared across prompt builders.
 */

import type { CanonicalEvent } from '@reckoning/shared';

/**
 * Format recent events for inclusion in prompts.
 *
 * Takes an array of canonical events and formats them into a readable
 * summary for the AI to understand recent game context.
 *
 * @param events - Recent canonical events
 * @param limit - Maximum number of events to include (default: 10)
 * @returns Formatted string of recent events
 */
export function formatRecentEvents(
  events: CanonicalEvent[],
  limit: number = 10
): string {
  if (events.length === 0) {
    return '(No recent events)';
  }

  const recentEvents = events.slice(-limit);

  return recentEvents
    .map((event) => {
      const speaker = event.speaker ? `[${event.speaker}] ` : '';
      const typeLabel = formatEventType(event.eventType);
      return `- ${typeLabel}: ${speaker}${event.content}`;
    })
    .join('\n');
}

/**
 * Format an event type into a human-readable label
 */
function formatEventType(eventType: string): string {
  const labels: Record<string, string> = {
    narration: 'Narration',
    party_action: 'Party Action',
    party_dialogue: 'Party Dialogue',
    npc_action: 'NPC Action',
    npc_dialogue: 'NPC Dialogue',
    environment: 'Environment',
    dm_injection: 'DM',
  };
  return labels[eventType] || eventType;
}
