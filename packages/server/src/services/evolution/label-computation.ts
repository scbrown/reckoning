/**
 * Label Computation Service
 *
 * Computes human-readable relationship labels from numeric dimensions.
 * Transforms raw relationship values into meaningful descriptors like
 * "devoted", "allied", "hostile", etc.
 */

import type { Relationship } from '../../db/repositories/relationship-repository.js';

/**
 * Available relationship labels
 */
export type RelationshipLabel =
  | 'devoted'
  | 'allied'
  | 'friendly'
  | 'trusted'
  | 'respected'
  | 'beloved'
  | 'wary'
  | 'feared'
  | 'terrified'
  | 'resented'
  | 'rival'
  | 'hostile'
  | 'indebted'
  | 'indifferent';

/**
 * Label with its intensity (0.0-1.0)
 */
export interface LabelScore {
  label: RelationshipLabel;
  intensity: number;
}

/**
 * Result of label computation
 */
export interface ComputedLabels {
  /** Primary label (strongest/most dominant) */
  primary: RelationshipLabel;
  /** All applicable labels with their intensities */
  labels: LabelScore[];
  /** Summary description for display */
  summary: string;
}

/**
 * Thresholds for label computation
 */
const THRESHOLDS = {
  HIGH: 0.7,
  VERY_HIGH: 0.8,
  MODERATE: 0.5,
  LOW: 0.3,
  VERY_LOW: 0.2,
  NEUTRAL_TOLERANCE: 0.15,
} as const;

/**
 * Compute human-readable labels from relationship dimensions
 */
export function computeLabels(relationship: Relationship): ComputedLabels {
  const scores = computeAllLabelScores(relationship);

  // Sort by intensity descending
  const sortedScores = [...scores].sort((a, b) => b.intensity - a.intensity);

  // Filter to only labels with meaningful intensity
  const meaningfulLabels = sortedScores.filter(s => s.intensity > 0);

  // Primary is highest intensity, default to indifferent
  const primary = meaningfulLabels[0]?.label ?? 'indifferent';

  // Generate summary
  const summary = generateSummary(relationship, primary, meaningfulLabels);

  return {
    primary,
    labels: meaningfulLabels,
    summary,
  };
}

/**
 * Compute intensity scores for all possible labels
 */
function computeAllLabelScores(r: Relationship): LabelScore[] {
  const scores: LabelScore[] = [];

  // Positive relationship labels
  scores.push({ label: 'devoted', intensity: computeDevotedScore(r) });
  scores.push({ label: 'allied', intensity: computeAlliedScore(r) });
  scores.push({ label: 'friendly', intensity: computeFriendlyScore(r) });
  scores.push({ label: 'trusted', intensity: computeTrustedScore(r) });
  scores.push({ label: 'respected', intensity: computeRespectedScore(r) });
  scores.push({ label: 'beloved', intensity: computeBelovedScore(r) });

  // Negative relationship labels
  scores.push({ label: 'hostile', intensity: computeHostileScore(r) });
  scores.push({ label: 'rival', intensity: computeRivalScore(r) });
  scores.push({ label: 'resented', intensity: computeResentedScore(r) });

  // Fear-based labels
  scores.push({ label: 'terrified', intensity: computeTerrifiedScore(r) });
  scores.push({ label: 'feared', intensity: computeFearedScore(r) });
  scores.push({ label: 'wary', intensity: computeWaryScore(r) });

  // Obligation labels
  scores.push({ label: 'indebted', intensity: computeIndebtedScore(r) });

  // Neutral
  scores.push({ label: 'indifferent', intensity: computeIndifferentScore(r) });

  return scores;
}

/**
 * Devoted: Very high affection, trust, and respect with minimal negative feelings
 */
function computeDevotedScore(r: Relationship): number {
  if (r.affection < THRESHOLDS.VERY_HIGH) return 0;
  if (r.trust < THRESHOLDS.HIGH) return 0;
  if (r.respect < THRESHOLDS.HIGH) return 0;
  if (r.fear > THRESHOLDS.LOW) return 0;
  if (r.resentment > THRESHOLDS.VERY_LOW) return 0;

  // Intensity based on how far above thresholds
  const affectionBonus = (r.affection - THRESHOLDS.VERY_HIGH) / (1 - THRESHOLDS.VERY_HIGH);
  const trustBonus = (r.trust - THRESHOLDS.HIGH) / (1 - THRESHOLDS.HIGH);
  const baseIntensity = 0.8 + 0.2 * (affectionBonus + trustBonus) / 2;

  return Math.min(1, baseIntensity);
}

/**
 * Allied: High trust and respect, cooperative relationship
 */
function computeAlliedScore(r: Relationship): number {
  if (r.trust < THRESHOLDS.HIGH) return 0;
  if (r.respect < THRESHOLDS.HIGH) return 0;
  if (r.resentment > THRESHOLDS.LOW) return 0;

  // Allied doesn't require high affection
  const intensity = ((r.trust - THRESHOLDS.HIGH) + (r.respect - THRESHOLDS.HIGH)) / (2 * (1 - THRESHOLDS.HIGH));
  return Math.min(0.9, 0.6 + 0.3 * intensity);
}

/**
 * Friendly: Above-neutral trust and affection, low negativity
 */
function computeFriendlyScore(r: Relationship): number {
  if (r.trust < THRESHOLDS.MODERATE + 0.1) return 0;
  if (r.affection < THRESHOLDS.MODERATE) return 0;
  if (r.fear > THRESHOLDS.LOW) return 0;
  if (r.resentment > THRESHOLDS.LOW) return 0;

  const intensity = ((r.trust - THRESHOLDS.MODERATE) + (r.affection - THRESHOLDS.MODERATE)) / 2;
  return Math.min(0.7, 0.4 + intensity);
}

/**
 * Trusted: High trust dimension
 */
function computeTrustedScore(r: Relationship): number {
  if (r.trust < THRESHOLDS.HIGH) return 0;

  return (r.trust - THRESHOLDS.HIGH) / (1 - THRESHOLDS.HIGH) * 0.8 + 0.2;
}

/**
 * Respected: High respect dimension
 */
function computeRespectedScore(r: Relationship): number {
  if (r.respect < THRESHOLDS.HIGH) return 0;

  return (r.respect - THRESHOLDS.HIGH) / (1 - THRESHOLDS.HIGH) * 0.8 + 0.2;
}

/**
 * Beloved: Very high affection
 */
function computeBelovedScore(r: Relationship): number {
  if (r.affection < THRESHOLDS.VERY_HIGH) return 0;

  return (r.affection - THRESHOLDS.VERY_HIGH) / (1 - THRESHOLDS.VERY_HIGH) * 0.8 + 0.2;
}

/**
 * Hostile: High resentment, low trust, willing to act against
 */
function computeHostileScore(r: Relationship): number {
  if (r.resentment < THRESHOLDS.MODERATE + 0.1) return 0;
  if (r.trust > THRESHOLDS.LOW) return 0;
  if (r.fear > THRESHOLDS.MODERATE) return 0; // Fear tempers hostility into wariness

  // Hostile is a compound state - when conditions are met, score higher than simple resentment
  const resentmentFactor = (r.resentment - THRESHOLDS.MODERATE) / (1 - THRESHOLDS.MODERATE);
  const distrustFactor = (THRESHOLDS.LOW - r.trust) / THRESHOLDS.LOW;
  const baseIntensity = 0.7 + 0.3 * (resentmentFactor + distrustFactor) / 2;
  return Math.min(1, baseIntensity * (1 - r.fear));
}

/**
 * Rival: Competitive tension - resentment or low respect, but not pure hatred
 */
function computeRivalScore(r: Relationship): number {
  // Must have some competitive tension
  const hasTension = r.resentment > THRESHOLDS.LOW || r.respect < THRESHOLDS.LOW;
  if (!hasTension) return 0;

  // But not pure hostility - trust is moderate, not minimal
  if (r.trust < THRESHOLDS.VERY_LOW) return 0;
  if (r.trust > THRESHOLDS.HIGH) return 0;

  // Fear shouldn't dominate
  if (r.fear > THRESHOLDS.MODERATE) return 0;

  const tensionIntensity = Math.max(r.resentment, 1 - r.respect);
  return tensionIntensity * 0.7;
}

/**
 * Resented: High resentment dimension
 */
function computeResentedScore(r: Relationship): number {
  if (r.resentment < THRESHOLDS.MODERATE) return 0;

  return (r.resentment - THRESHOLDS.MODERATE) / (1 - THRESHOLDS.MODERATE) * 0.8 + 0.2;
}

/**
 * Terrified: Very high fear
 */
function computeTerrifiedScore(r: Relationship): number {
  if (r.fear < THRESHOLDS.HIGH) return 0;

  return (r.fear - THRESHOLDS.HIGH) / (1 - THRESHOLDS.HIGH) * 0.8 + 0.2;
}

/**
 * Feared: Moderate-high fear
 */
function computeFearedScore(r: Relationship): number {
  if (r.fear < THRESHOLDS.MODERATE) return 0;
  if (r.fear >= THRESHOLDS.HIGH) return 0; // Becomes terrified instead

  return (r.fear - THRESHOLDS.MODERATE) / (THRESHOLDS.HIGH - THRESHOLDS.MODERATE) * 0.6 + 0.2;
}

/**
 * Wary: Low-moderate fear with low trust
 */
function computeWaryScore(r: Relationship): number {
  if (r.fear < THRESHOLDS.LOW) return 0;
  if (r.fear >= THRESHOLDS.MODERATE) return 0; // Becomes feared/terrified
  if (r.trust > THRESHOLDS.MODERATE) return 0; // Trust overrides wariness

  const intensity = r.fear * (1 - r.trust);
  return intensity * 0.6;
}

/**
 * Indebted: High debt dimension
 */
function computeIndebtedScore(r: Relationship): number {
  if (r.debt < THRESHOLDS.MODERATE) return 0;

  return (r.debt - THRESHOLDS.MODERATE) / (1 - THRESHOLDS.MODERATE) * 0.8 + 0.2;
}

/**
 * Indifferent: All dimensions near neutral defaults
 */
function computeIndifferentScore(r: Relationship): number {
  const tolerance = THRESHOLDS.NEUTRAL_TOLERANCE;

  // Check how close each dimension is to its default
  const trustDev = Math.abs(r.trust - 0.5);
  const respectDev = Math.abs(r.respect - 0.5);
  const affectionDev = Math.abs(r.affection - 0.5);
  const fearDev = r.fear; // Default is 0
  const resentmentDev = r.resentment; // Default is 0
  const debtDev = r.debt; // Default is 0

  // If any dimension is significantly off default, not indifferent
  const maxDev = Math.max(trustDev, respectDev, affectionDev, fearDev, resentmentDev, debtDev);
  if (maxDev > tolerance * 2) return 0;

  // Intensity inversely proportional to deviation
  return Math.max(0, 1 - maxDev / tolerance);
}

/**
 * Generate a human-readable summary of the relationship
 */
function generateSummary(
  _r: Relationship,
  primary: RelationshipLabel,
  labels: LabelScore[]
): string {
  // Get top 2-3 labels for the summary
  const topLabels = labels.slice(0, 3).map(l => l.label);

  if (primary === 'indifferent') {
    return 'No strong feelings either way';
  }

  if (topLabels.length === 1) {
    return formatLabelForSummary(primary);
  }

  // Combine multiple labels into a description
  const secondary = topLabels.slice(1);

  // Handle complex combinations
  if (primary === 'devoted' && secondary.includes('trusted')) {
    return 'Deeply devoted and trusting';
  }
  if (primary === 'hostile' && secondary.includes('feared')) {
    return 'Hostile but wary';
  }
  if (primary === 'allied' && secondary.includes('respected')) {
    return 'A respected ally';
  }
  if (primary === 'friendly' && secondary.includes('trusted')) {
    return 'A trusted friend';
  }
  if (primary === 'terrified' && secondary.includes('resented')) {
    return 'Terrified but resentful';
  }
  if (primary === 'rival' && secondary.includes('respected')) {
    return 'A respected rival';
  }
  if (primary === 'indebted' && secondary.includes('trusted')) {
    return 'Owes a debt of gratitude';
  }

  // Default: just describe the primary
  return formatLabelForSummary(primary);
}

/**
 * Format a single label for display
 */
function formatLabelForSummary(label: RelationshipLabel): string {
  switch (label) {
    case 'devoted': return 'Deeply devoted';
    case 'allied': return 'A trusted ally';
    case 'friendly': return 'On friendly terms';
    case 'trusted': return 'Highly trusted';
    case 'respected': return 'Greatly respected';
    case 'beloved': return 'Deeply beloved';
    case 'wary': return 'Cautious and wary';
    case 'feared': return 'Somewhat feared';
    case 'terrified': return 'Absolutely terrified';
    case 'resented': return 'Harbors resentment';
    case 'rival': return 'A competitive rival';
    case 'hostile': return 'Openly hostile';
    case 'indebted': return 'Feels indebted';
    case 'indifferent': return 'No strong feelings';
  }
}

/**
 * Get a short label for compact display (e.g., in a list)
 */
export function getShortLabel(label: RelationshipLabel): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Get the valence of a label (positive, negative, or neutral)
 */
export function getLabelValence(label: RelationshipLabel): 'positive' | 'negative' | 'neutral' {
  switch (label) {
    case 'devoted':
    case 'allied':
    case 'friendly':
    case 'trusted':
    case 'respected':
    case 'beloved':
      return 'positive';
    case 'hostile':
    case 'rival':
    case 'resented':
    case 'terrified':
    case 'feared':
      return 'negative';
    case 'wary':
    case 'indebted':
    case 'indifferent':
      return 'neutral';
  }
}
