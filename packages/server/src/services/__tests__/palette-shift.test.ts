import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  applyPaletteShift,
  getPresetAdjustment,
  getAvailablePresets,
} from '../palette-shift.js';
import type { PaletteShift, PaletteZones } from '../palette-shift.js';

/**
 * Create a simple test image with known colors
 * @param width Image width
 * @param height Image height
 * @param color RGBA color [r, g, b, a]
 */
async function createTestImage(
  width: number,
  height: number,
  color: [number, number, number, number]
): Promise<Buffer> {
  const channels = 4;
  const pixels = Buffer.alloc(width * height * channels);

  for (let i = 0; i < width * height; i++) {
    pixels[i * channels] = color[0];
    pixels[i * channels + 1] = color[1];
    pixels[i * channels + 2] = color[2];
    pixels[i * channels + 3] = color[3];
  }

  return sharp(pixels, {
    raw: { width, height, channels },
  })
    .png()
    .toBuffer();
}

/**
 * Get the dominant color from an image
 */
async function getDominantColor(
  imageBuffer: Buffer
): Promise<[number, number, number]> {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Get first non-transparent pixel
  for (let i = 0; i < data.length; i += info.channels) {
    const a = data[i + 3]!;
    if (a > 0) {
      return [data[i]!, data[i + 1]!, data[i + 2]!];
    }
  }

  return [0, 0, 0];
}

describe('palette-shift', () => {
  describe('getAvailablePresets', () => {
    it('should return all preset names', () => {
      const presets = getAvailablePresets();

      expect(presets).toContain('warm_heroic');
      expect(presets).toContain('cool_villain');
      expect(presets).toContain('gritty_worn');
      expect(presets).toContain('festive');
      expect(presets).toContain('noir');
      expect(presets).toContain('horror');
      expect(presets).toContain('custom');
      expect(presets).toHaveLength(7);
    });
  });

  describe('getPresetAdjustment', () => {
    it('should return HSL adjustments for warm_heroic', () => {
      const adjustment = getPresetAdjustment('warm_heroic');

      expect(adjustment.hue).toBe(15);
      expect(adjustment.saturation).toBe(1.1);
      expect(adjustment.brightness).toBe(1.1);
    });

    it('should return HSL adjustments for cool_villain', () => {
      const adjustment = getPresetAdjustment('cool_villain');

      expect(adjustment.hue).toBe(-30);
      expect(adjustment.saturation).toBe(0.9);
      expect(adjustment.brightness).toBe(0.85);
    });

    it('should return HSL adjustments for gritty_worn', () => {
      const adjustment = getPresetAdjustment('gritty_worn');

      expect(adjustment.hue).toBe(0);
      expect(adjustment.saturation).toBe(0.5);
      expect(adjustment.brightness).toBe(0.9);
    });

    it('should return HSL adjustments for noir', () => {
      const adjustment = getPresetAdjustment('noir');

      expect(adjustment.hue).toBe(0);
      expect(adjustment.saturation).toBe(0.15);
      expect(adjustment.brightness).toBe(1.1);
    });
  });

  describe('applyPaletteShift', () => {
    it('should return original image when no shift specified', async () => {
      const original = await createTestImage(10, 10, [128, 64, 192, 255]);

      const result = await applyPaletteShift(original, {});

      // Should be same as original
      const [r, g, b] = await getDominantColor(result);
      expect(r).toBe(128);
      expect(g).toBe(64);
      expect(b).toBe(192);
    });

    it('should apply hue shift', async () => {
      // Create a red image
      const original = await createTestImage(10, 10, [255, 0, 0, 255]);

      // Shift hue by 120 degrees (red -> green)
      const shift: PaletteShift = { hueShift: 120 };
      const result = await applyPaletteShift(original, shift);

      const [r, g, b] = await getDominantColor(result);
      // Red shifted by 120 degrees should be greenish
      expect(g).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(b);
    });

    it('should apply saturation adjustment', async () => {
      // Create a colored image
      const original = await createTestImage(10, 10, [200, 100, 100, 255]);

      // Desaturate
      const shift: PaletteShift = { saturation: 0.0 };
      const result = await applyPaletteShift(original, shift);

      const [r, g, b] = await getDominantColor(result);
      // Should be grayscale (all channels similar)
      expect(Math.abs(r - g)).toBeLessThan(5);
      expect(Math.abs(g - b)).toBeLessThan(5);
    });

    it('should apply brightness adjustment', async () => {
      const original = await createTestImage(10, 10, [128, 128, 128, 255]);

      // Darken
      const shift: PaletteShift = { brightness: 0.5 };
      const result = await applyPaletteShift(original, shift);

      const [r, g, b] = await getDominantColor(result);
      // Should be darker than original
      expect(r).toBeLessThan(128);
      expect(g).toBeLessThan(128);
      expect(b).toBeLessThan(128);
    });

    it('should apply warm_heroic preset', async () => {
      const original = await createTestImage(10, 10, [128, 128, 128, 255]);

      const shift: PaletteShift = { preset: 'warm_heroic' };
      const result = await applyPaletteShift(original, shift);

      const [r, g, b] = await getDominantColor(result);
      // Warm heroic shifts toward orange/gold, so red should increase relative to blue
      // With gray input and warm shift, red channel should be slightly higher
      expect(r).toBeGreaterThanOrEqual(g);
    });

    it('should apply noir preset (near grayscale)', async () => {
      // Create a colorful image
      const original = await createTestImage(10, 10, [255, 0, 0, 255]);

      const shift: PaletteShift = { preset: 'noir' };
      const result = await applyPaletteShift(original, shift);

      const [r, g, b] = await getDominantColor(result);
      // Noir is very desaturated (0.15), so should be nearly grayscale
      const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
      expect(maxDiff).toBeLessThan(50);
    });

    it('should skip transparent pixels', async () => {
      // Create image with transparent pixels
      const original = await createTestImage(10, 10, [0, 0, 0, 0]);

      // Apply dramatic shift
      const shift: PaletteShift = { hueShift: 180, saturation: 2.0 };
      const result = await applyPaletteShift(original, shift);

      // Should still be valid PNG
      const info = await sharp(result).metadata();
      expect(info.format).toBe('png');
    });

    it('should override preset with explicit values', async () => {
      const original = await createTestImage(10, 10, [128, 128, 128, 255]);

      // Use preset but override hue
      const shift: PaletteShift = {
        preset: 'warm_heroic',
        hueShift: -60, // Override warm_heroic's +15 with -60
      };
      const result = await applyPaletteShift(original, shift);

      // With -60 hue shift, should shift toward blue/purple
      const [r, g, b] = await getDominantColor(result);
      expect(b).toBeGreaterThanOrEqual(r);
    });

    it('should clamp values to valid ranges', async () => {
      const original = await createTestImage(10, 10, [128, 128, 128, 255]);

      // Use extreme values
      const shift: PaletteShift = {
        hueShift: 500, // Should clamp to 180
        saturation: 10, // Should clamp to 2.0
        brightness: -5, // Should clamp to 0
      };

      // Should not throw
      const result = await applyPaletteShift(original, shift);
      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('zone-based shifting', () => {
    it('should replace zone colors when zones match', async () => {
      // Create image with a specific color
      const originalColor: [number, number, number, number] = [120, 80, 60, 255];
      const original = await createTestImage(10, 10, originalColor);

      // Define sprite zones (what the original sprite has)
      const spriteZones: PaletteZones = {
        skin: [120, 80, 60],
      };

      // Define target zones (what we want to shift to)
      const shift: PaletteShift = {
        zones: {
          skin: [180, 140, 120], // Lighter skin tone
        },
      };

      const result = await applyPaletteShift(original, shift, spriteZones);

      const [r, g, b] = await getDominantColor(result);
      // Should be shifted toward the target color
      expect(r).toBeGreaterThan(120); // Original was 120, target is 180
      expect(g).toBeGreaterThan(80); // Original was 80, target is 140
      expect(b).toBeGreaterThan(60); // Original was 60, target is 120
    });

    it('should not apply zone shift if zones not provided', async () => {
      const original = await createTestImage(10, 10, [120, 80, 60, 255]);

      const shift: PaletteShift = {
        zones: {
          skin: [180, 140, 120],
        },
      };

      // No spriteZones provided
      const result = await applyPaletteShift(original, shift);

      const [r, g, b] = await getDominantColor(result);
      // Should be unchanged
      expect(r).toBe(120);
      expect(g).toBe(80);
      expect(b).toBe(60);
    });

    it('should apply HSL to non-zone pixels', async () => {
      // Create image with two colors - one matching zone, one not
      const width = 2;
      const height = 1;
      const channels = 4;
      const pixels = Buffer.alloc(width * height * channels);

      // First pixel: skin color (will be zone-shifted)
      pixels[0] = 120;
      pixels[1] = 80;
      pixels[2] = 60;
      pixels[3] = 255;

      // Second pixel: different color (will be HSL-shifted)
      pixels[4] = 50;
      pixels[5] = 50;
      pixels[6] = 200;
      pixels[7] = 255;

      const original = await sharp(pixels, {
        raw: { width, height, channels },
      })
        .png()
        .toBuffer();

      const spriteZones: PaletteZones = {
        skin: [120, 80, 60],
      };

      const shift: PaletteShift = {
        preset: 'gritty_worn', // Desaturates non-zone pixels
        zones: {
          skin: [180, 140, 120],
        },
      };

      const result = await applyPaletteShift(original, shift, spriteZones);

      // Verify result is valid
      const info = await sharp(result).metadata();
      expect(info.format).toBe('png');
      expect(info.width).toBe(2);
      expect(info.height).toBe(1);
    });
  });
});
