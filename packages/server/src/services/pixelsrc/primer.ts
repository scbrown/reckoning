/**
 * Pixelsrc Format Primer
 *
 * A comprehensive primer teaching the pixelsrc JSONL format for AI generation.
 * This primer is prepended to generation prompts so the AI understands how to
 * produce valid .pxl source files.
 */

export const PIXELSRC_FORMAT_PRIMER = `# Pixelsrc Format Specification

Pixelsrc is a JSONL-based format for defining pixel art. Each line is a valid JSON object representing a palette, sprite, variant, or composition.

## File Structure

A .pxl file consists of JSONL (JSON Lines) where each line is one of:
- A palette definition (colors to use)
- A sprite definition (pixel grid)
- A variant definition (sprite modifications)
- A composition definition (layered sprites)

## Palette Definition

Defines named colors using single-character tokens:

\`\`\`json
{"type":"palette","name":"colors","colors":{".":"transparent","#":"#000000","r":"#FF0000","g":"#00FF00","b":"#0000FF","w":"#FFFFFF","y":"#FFFF00"}}
\`\`\`

Rules:
- "type" must be "palette"
- "name" is optional (defaults to "default")
- "colors" maps single-character tokens to hex colors or "transparent"
- Use lowercase letters, numbers, or symbols as tokens
- "." is conventionally used for transparent/background

## Sprite Definition

Defines a pixel grid using palette tokens:

\`\`\`json
{"type":"sprite","name":"hero_idle","palette":"colors","grid":["...##...","..#rr#..","..#rr#..",".##rr##.","#rrrrrr#","..#rr#..","..#..#..","..##.##."]}
\`\`\`

Rules:
- "type" must be "sprite"
- "name" is the sprite identifier
- "palette" references a palette by name
- "grid" is an array of strings, one per row
- All grid rows should have equal length
- Each character in grid must exist in the referenced palette

## Variant Definition

Modifies an existing sprite with palette swaps or transformations:

\`\`\`json
{"type":"variant","name":"hero_hurt","base":"hero_idle","swaps":{"r":"#FF6666"}}
\`\`\`

Rules:
- "type" must be "variant"
- "name" is the variant identifier
- "base" references the base sprite name
- "swaps" maps palette tokens to new colors

## Composition Definition

Layers multiple sprites together:

\`\`\`json
{"type":"composition","name":"hero_equipped","layers":[{"sprite":"hero_idle","x":0,"y":0},{"sprite":"sword","x":8,"y":4}]}
\`\`\`

Rules:
- "type" must be "composition"
- "name" is the composition identifier
- "layers" is an array of layer objects
- Each layer has "sprite" (name), "x" and "y" (position)
- Later layers render on top of earlier ones

## Best Practices

1. **Small dimensions**: Keep sprites between 8x8 and 32x32 pixels for classic pixel art feel
2. **Limited palette**: Use 4-16 colors per sprite for authentic retro aesthetics
3. **Meaningful names**: Use descriptive names like "hero_idle", "tree_oak", "sword_iron"
4. **Consistent tokens**: Reuse color tokens across related palettes
5. **Animation frames**: Create related sprites with suffixes like "_frame1", "_frame2"

## Example Complete File

\`\`\`
{"type":"palette","name":"char_palette","colors":{".":"transparent","#":"#1a1a2e","s":"#e6b89c","h":"#4a3728","c":"#3a5a8c","g":"#2d4a3e"}}
{"type":"sprite","name":"portrait_base","palette":"char_palette","grid":["....####....","...#hhhh#...","..#hhhhhh#..",".#ssssssss#.",".#s#ss#ss#s.",".#ssssssss#.",".#ss#ss#ss#.","..#ssssss#..","...#cccc#...","...#cccc#...","...#c##c#...","....#..#...."]}
{"type":"variant","name":"portrait_angry","base":"portrait_base","swaps":{"s":"#ffb6a3"}}
\`\`\`

## Output Requirements

When generating pixelsrc content:
1. Output ONLY valid JSONL - one JSON object per line
2. Start with palette definitions
3. Follow with sprite definitions
4. Add variants and compositions as needed
5. Do not include comments, explanations, or markdown
6. Ensure all referenced palettes and sprites exist
7. Use consistent grid dimensions within a sprite
`;

/**
 * Primer for generating character portraits in pixel art style.
 */
export const PORTRAIT_GENERATION_PRIMER = `${PIXELSRC_FORMAT_PRIMER}

## Portrait Specifications

Generate a character portrait following these guidelines:

- **Dimensions**: 12x16 pixels (portrait aspect ratio)
- **Subject**: Head and upper shoulders only
- **Style**: Front-facing or 3/4 view
- **Features**: Clear eyes, distinguishable hair/head features
- **Palette**: 6-10 colors including skin tones, hair, clothing accent

Portrait color conventions:
- "." for transparent background
- "s" for skin tones
- "h" for hair
- "e" for eyes
- "c" for clothing/armor
- "#" for outlines/shadows
`;

/**
 * Primer for generating scene backgrounds in pixel art style.
 */
export const SCENE_GENERATION_PRIMER = `${PIXELSRC_FORMAT_PRIMER}

## Scene Specifications

Generate a scene background following these guidelines:

- **Dimensions**: 128x96 pixels (landscape aspect ratio) or 64x48 for thumbnails
- **Layers**: Include foreground, midground, and background elements
- **Depth**: Use color value to create depth (darker = closer, lighter = farther)
- **Style**: Atmospheric with environmental details
- **Palette**: 12-24 colors for rich environments

Scene composition tips:
- Ground/floor at bottom 1/4
- Main subject in middle section
- Sky/ceiling in top 1/4
- Include at least one focal point
- Add atmospheric elements (particles, light rays, etc.)
`;

/**
 * Primer for generating color palettes.
 */
export const PALETTE_GENERATION_PRIMER = `${PIXELSRC_FORMAT_PRIMER}

## Palette Specifications

Generate a color palette following these guidelines:

- **Size**: 8-16 colors for versatility
- **Structure**: Include base colors plus highlights and shadows
- **Harmony**: Use complementary or analogous color schemes
- **Contrast**: Ensure sufficient contrast between adjacent colors

Standard palette structure:
- 1-2 background/transparent colors
- 2-3 skin tone variations (if character-focused)
- 2-3 primary accent colors
- 1-2 secondary accent colors
- 2-3 shadow/outline colors
- 1-2 highlight colors

Token naming conventions:
- "." = transparent
- "#" = darkest outline/shadow
- Numbers 0-9 for grayscale gradient
- Letters for specific colors (r=red, g=green, b=blue, etc.)
`;

/**
 * Get the primer for a specific generation type.
 */
export function getPrimer(type: 'portrait' | 'scene' | 'palette'): string {
  switch (type) {
    case 'portrait':
      return PORTRAIT_GENERATION_PRIMER;
    case 'scene':
      return SCENE_GENERATION_PRIMER;
    case 'palette':
      return PALETTE_GENERATION_PRIMER;
    default:
      return PIXELSRC_FORMAT_PRIMER;
  }
}
