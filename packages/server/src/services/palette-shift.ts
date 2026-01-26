/**
 * Palette Shift Service
 *
 * Applies mood-based palette shifts to sprite images using Sharp.
 * Supports both global HSL adjustments and zone-based color replacement.
 */

import sharp from 'sharp';

// =============================================================================
// Types
// =============================================================================

/**
 * Predefined palette presets that convey different moods
 */
export type PalettePreset =
  | 'warm_heroic' // Golds, warm browns - for heroes and protagonists
  | 'cool_villain' // Purples, dark blues - for antagonists
  | 'gritty_worn' // Desaturated, dusty - for weathered characters
  | 'festive' // Bright, saturated - for celebrations
  | 'noir' // High contrast B&W + accent - for mystery/drama
  | 'horror' // Greens, sickly yellows - for horror/undead
  | 'custom'; // AI specifies HSL shifts directly

/**
 * Palette shift configuration
 */
export interface PaletteShift {
  /** Use a predefined preset (will be overridden by explicit HSL values) */
  preset?: PalettePreset;
  /** Hue rotation in degrees (-180 to 180) */
  hueShift?: number;
  /** Saturation multiplier (0.0 to 2.0, where 1.0 is unchanged) */
  saturation?: number;
  /** Brightness multiplier (0.0 to 2.0, where 1.0 is unchanged) */
  brightness?: number;
  /** Per-zone RGB target colors for color replacement */
  zones?: Record<string, [number, number, number]>;
}

/**
 * Palette zones defined in sprite metadata
 * Maps zone names to their original RGB colors
 */
export interface PaletteZones {
  [zoneName: string]: [number, number, number];
}

/**
 * HSL adjustment values
 */
interface HSLAdjustment {
  hue: number; // -180 to 180
  saturation: number; // 0.0 to 2.0
  brightness: number; // 0.0 to 2.0
}

// =============================================================================
// Preset Definitions
// =============================================================================

/**
 * HSL adjustments for each preset
 */
const PRESET_ADJUSTMENTS: Record<Exclude<PalettePreset, 'custom'>, HSLAdjustment> = {
  warm_heroic: {
    hue: 15, // Shift toward orange/gold
    saturation: 1.1, // Slightly more saturated
    brightness: 1.1, // Slightly brighter
  },
  cool_villain: {
    hue: -30, // Shift toward purple/blue
    saturation: 0.9, // Slightly desaturated
    brightness: 0.85, // Darker
  },
  gritty_worn: {
    hue: 0, // No hue shift
    saturation: 0.5, // Heavy desaturation
    brightness: 0.9, // Slightly darker
  },
  festive: {
    hue: 0, // No hue shift
    saturation: 1.4, // Very saturated
    brightness: 1.2, // Brighter
  },
  noir: {
    hue: 0, // No hue shift
    saturation: 0.15, // Almost grayscale
    brightness: 1.1, // High contrast through brightness
  },
  horror: {
    hue: 60, // Shift toward green/yellow
    saturation: 0.7, // Somewhat desaturated
    brightness: 0.8, // Darker
  },
};

// =============================================================================
// Color Conversion Utilities
// =============================================================================

/**
 * Convert RGB to HSL
 * @returns [hue (0-360), saturation (0-1), lightness (0-1)]
 */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return [0, 0, l]; // Achromatic
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
      break;
  }

  return [h * 360, s, l];
}

/**
 * Convert HSL to RGB
 * @param h Hue (0-360)
 * @param s Saturation (0-1)
 * @param l Lightness (0-1)
 * @returns [r, g, b] each 0-255
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360; // Normalize hue to 0-360
  h /= 360;

  if (s === 0) {
    const gray = Math.round(l * 255);
    return [gray, gray, gray];
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

/**
 * Calculate color distance using simple Euclidean distance in RGB space
 */
function colorDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number
): number {
  return Math.sqrt(Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2));
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Apply palette shift to an image buffer
 *
 * @param image - Input image as a Buffer (PNG format recommended)
 * @param shift - Palette shift configuration
 * @param spriteZones - Optional palette zones from sprite metadata for zone-based shifting
 * @returns Modified image as a Buffer
 *
 * @example
 * ```typescript
 * // Apply warm heroic preset
 * const shifted = await applyPaletteShift(imageBuffer, { preset: 'warm_heroic' });
 *
 * // Apply custom HSL shift
 * const custom = await applyPaletteShift(imageBuffer, {
 *   hueShift: 30,
 *   saturation: 1.2,
 *   brightness: 0.9
 * });
 *
 * // Apply zone-based color replacement
 * const zoned = await applyPaletteShift(
 *   imageBuffer,
 *   { zones: { skin: [180, 140, 120], clothing_primary: [50, 50, 80] } },
 *   { skin: [120, 80, 60], clothing_primary: [100, 100, 110] }
 * );
 * ```
 */
export async function applyPaletteShift(
  image: Buffer,
  shift: PaletteShift,
  spriteZones?: PaletteZones
): Promise<Buffer> {
  // Get adjustment values from preset or use provided values
  let adjustment: HSLAdjustment;

  if (shift.preset && shift.preset !== 'custom' && PRESET_ADJUSTMENTS[shift.preset]) {
    adjustment = { ...PRESET_ADJUSTMENTS[shift.preset] };
  } else {
    adjustment = {
      hue: 0,
      saturation: 1.0,
      brightness: 1.0,
    };
  }

  // Override with explicit values if provided
  if (shift.hueShift !== undefined) {
    adjustment.hue = shift.hueShift;
  }
  if (shift.saturation !== undefined) {
    adjustment.saturation = shift.saturation;
  }
  if (shift.brightness !== undefined) {
    adjustment.brightness = shift.brightness;
  }

  // Clamp values to valid ranges
  adjustment.hue = Math.max(-180, Math.min(180, adjustment.hue));
  adjustment.saturation = Math.max(0, Math.min(2, adjustment.saturation));
  adjustment.brightness = Math.max(0, Math.min(2, adjustment.brightness));

  // Check if we need to do zone-based shifting
  const hasZoneShifting = shift.zones && spriteZones && Object.keys(shift.zones).length > 0;

  // Check if we need to do any HSL adjustment
  const needsHslAdjustment =
    adjustment.hue !== 0 || adjustment.saturation !== 1.0 || adjustment.brightness !== 1.0;

  // If no modifications needed, return original
  if (!needsHslAdjustment && !hasZoneShifting) {
    return image;
  }

  // Get raw pixel data
  const { data, info } = await sharp(image)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(data);
  const { width, height, channels } = info;

  // Build zone color mapping for fast lookup
  const zoneMapping: Array<{
    sourceR: number;
    sourceG: number;
    sourceB: number;
    targetR: number;
    targetG: number;
    targetB: number;
  }> = [];

  if (hasZoneShifting && spriteZones && shift.zones) {
    for (const [zoneName, targetColor] of Object.entries(shift.zones)) {
      const sourceColor = spriteZones[zoneName];
      if (sourceColor) {
        zoneMapping.push({
          sourceR: sourceColor[0],
          sourceG: sourceColor[1],
          sourceB: sourceColor[2],
          targetR: targetColor[0],
          targetG: targetColor[1],
          targetB: targetColor[2],
        });
      }
    }
  }

  // Color distance tolerance for zone matching (out of 441.67 max RGB distance)
  const ZONE_TOLERANCE = 30;

  // Process each pixel
  for (let i = 0; i < pixels.length; i += channels) {
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    const a = channels === 4 ? pixels[i + 3]! : 255;

    // Skip fully transparent pixels
    if (a === 0) {
      continue;
    }

    let newR = r;
    let newG = g;
    let newB = b;

    // Check for zone-based replacement first
    let zoneMatched = false;
    if (zoneMapping.length > 0) {
      for (const zone of zoneMapping) {
        const distance = colorDistance(r, g, b, zone.sourceR, zone.sourceG, zone.sourceB);
        if (distance <= ZONE_TOLERANCE) {
          // Interpolate between original and target based on how close the match is
          const factor = 1 - distance / ZONE_TOLERANCE;
          newR = Math.round(r + (zone.targetR - zone.sourceR) * factor);
          newG = Math.round(g + (zone.targetG - zone.sourceG) * factor);
          newB = Math.round(b + (zone.targetB - zone.sourceB) * factor);
          zoneMatched = true;
          break;
        }
      }
    }

    // Apply HSL adjustment if no zone matched or if HSL adjustment is needed
    if (needsHslAdjustment && !zoneMatched) {
      const [h, s, l] = rgbToHsl(newR, newG, newB);

      // Apply adjustments
      const newH = h + adjustment.hue;
      const newS = Math.max(0, Math.min(1, s * adjustment.saturation));
      const newL = Math.max(0, Math.min(1, l * adjustment.brightness));

      [newR, newG, newB] = hslToRgb(newH, newS, newL);
    }

    // Clamp to valid range
    pixels[i] = Math.max(0, Math.min(255, newR));
    pixels[i + 1] = Math.max(0, Math.min(255, newG));
    pixels[i + 2] = Math.max(0, Math.min(255, newB));
  }

  // Convert back to PNG
  return sharp(pixels, {
    raw: {
      width,
      height,
      channels,
    },
  })
    .png()
    .toBuffer();
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get the HSL adjustment values for a preset
 */
export function getPresetAdjustment(preset: Exclude<PalettePreset, 'custom'>): HSLAdjustment {
  return { ...PRESET_ADJUSTMENTS[preset] };
}

/**
 * Get all available preset names
 */
export function getAvailablePresets(): PalettePreset[] {
  return ['warm_heroic', 'cool_villain', 'gritty_worn', 'festive', 'noir', 'horror', 'custom'];
}
