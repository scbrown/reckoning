# LPC Spritesheet Attribution

This directory contains artwork from the Liberated Pixel Cup (LPC) project.

## Source

- Repository: https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator
- Original project: https://lpc.opengameart.org

## Licenses

The artwork in this directory is licensed under one or more of the following:

- **CC0** - Public domain, no attribution required
- **CC-BY-SA 3.0/4.0** - Attribution required, share-alike
- **CC-BY 3.0/4.0** - Attribution required
- **OGA-BY 3.0** - Attribution required, DRM-friendly
- **GPL 3.0** - Copyleft, share-alike

**CC-BY-SA is the most restrictive license present. Following its terms covers all licenses.**

## Attribution Requirements

Per the CC-BY-SA license, you must:

1. Credit all contributing artists (see CREDITS.csv)
2. Distribute derivative works under CC-BY-SA 3.0 or later
3. Make credits accessible from within your application

## Credits

See `CREDITS.csv` for per-file attribution details including:
- Authors
- License(s)
- Original source URLs

## Summary Credit

When using these sprites, include a credit such as:

> Sprites by the Liberated Pixel Cup contributors.
> Contributed as part of the Liberated Pixel Cup project from OpenGameArt.org.
> http://opengameart.org/content/lpc-collection
> License: Creative Commons Attribution-ShareAlike 3.0 (CC-BY-SA 3.0)
> Full credits: See CREDITS.csv

## Directory Structure

```
lpc-layers/
  body/       - Base character bodies, heads, eyes
  hair/       - Hair styles, beards, facial features
  armor/      - Clothing and armor (torso, legs, feet, etc.)
  weapons/    - Weapons, shields, quivers
  accessories/- Backpacks, hats, tools, shadows
```

## Animation Dimensions

| Animation | Dimensions |
|-----------|------------|
| walk      | 576 x 256  |
| slash     | 384 x 256  |
| spellcast | 448 x 256  |
| thrust    | 512 x 256  |
| shoot     | 832 x 256  |
| hurt      | 384 x 64   |

All sprites use 64x64 pixel frames arranged in rows.

## Setup

This directory contains only sample files for structure verification. To fetch the
complete asset library (~1.6GB), run:

```bash
./scripts/fetch-lpc-assets.sh
```

Or manually:

```bash
git clone --depth 1 https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator /tmp/lpc-generator
# Then copy spritesheets/* organized into body/, hair/, armor/, weapons/, accessories/
```
