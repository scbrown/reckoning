#!/bin/bash
# fetch-lpc-assets.sh
# Downloads and organizes LPC spritesheet assets for server-side composition
#
# This script fetches the complete LPC Universal Spritesheet library (~1.6GB)
# and organizes it into the assets/lpc-layers/ directory structure.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ASSETS_DIR="$PROJECT_ROOT/assets/lpc-layers"
TEMP_DIR="/tmp/lpc-generator-$$"

echo "Fetching LPC Universal Spritesheet assets..."
echo "Target: $ASSETS_DIR"
echo ""

# Clone the repository (shallow)
echo "Cloning LPC repository (this may take a while)..."
git clone --depth 1 https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator "$TEMP_DIR"

# Create target directories
mkdir -p "$ASSETS_DIR"/{body,hair,armor,weapons,accessories}

echo "Organizing assets into categories..."

# body - base character parts
echo "  Copying body assets..."
cp -r "$TEMP_DIR/spritesheets/body"/* "$ASSETS_DIR/body/" 2>/dev/null || true
cp -r "$TEMP_DIR/spritesheets/head" "$ASSETS_DIR/body/" 2>/dev/null || true
cp -r "$TEMP_DIR/spritesheets/eyes" "$ASSETS_DIR/body/" 2>/dev/null || true

# hair - hair and facial hair
echo "  Copying hair assets..."
cp -r "$TEMP_DIR/spritesheets/hair"/* "$ASSETS_DIR/hair/" 2>/dev/null || true
cp -r "$TEMP_DIR/spritesheets/beards" "$ASSETS_DIR/hair/" 2>/dev/null || true
cp -r "$TEMP_DIR/spritesheets/facial" "$ASSETS_DIR/hair/" 2>/dev/null || true

# armor - clothing and armor pieces
echo "  Copying armor assets..."
cp -r "$TEMP_DIR/spritesheets/torso" "$ASSETS_DIR/armor/" 2>/dev/null || true
cp -r "$TEMP_DIR/spritesheets/legs" "$ASSETS_DIR/armor/" 2>/dev/null || true
cp -r "$TEMP_DIR/spritesheets/feet" "$ASSETS_DIR/armor/" 2>/dev/null || true
cp -r "$TEMP_DIR/spritesheets/arms" "$ASSETS_DIR/armor/" 2>/dev/null || true
cp -r "$TEMP_DIR/spritesheets/wrists" "$ASSETS_DIR/armor/" 2>/dev/null || true
cp -r "$TEMP_DIR/spritesheets/bauldron" "$ASSETS_DIR/armor/" 2>/dev/null || true
cp -r "$TEMP_DIR/spritesheets/shoulders" "$ASSETS_DIR/armor/" 2>/dev/null || true
cp -r "$TEMP_DIR/spritesheets/neck" "$ASSETS_DIR/armor/" 2>/dev/null || true
cp -r "$TEMP_DIR/spritesheets/dress" "$ASSETS_DIR/armor/" 2>/dev/null || true
cp -r "$TEMP_DIR/spritesheets/cape" "$ASSETS_DIR/armor/" 2>/dev/null || true

# weapons - weapons and combat accessories
echo "  Copying weapon assets..."
cp -r "$TEMP_DIR/spritesheets/weapon" "$ASSETS_DIR/weapons/" 2>/dev/null || true
cp -r "$TEMP_DIR/spritesheets/shield" "$ASSETS_DIR/weapons/" 2>/dev/null || true
cp -r "$TEMP_DIR/spritesheets/quiver" "$ASSETS_DIR/weapons/" 2>/dev/null || true

# accessories - misc items
echo "  Copying accessory assets..."
cp -r "$TEMP_DIR/spritesheets/backpack" "$ASSETS_DIR/accessories/" 2>/dev/null || true
cp -r "$TEMP_DIR/spritesheets/hat" "$ASSETS_DIR/accessories/" 2>/dev/null || true
cp -r "$TEMP_DIR/spritesheets/tools" "$ASSETS_DIR/accessories/" 2>/dev/null || true
cp -r "$TEMP_DIR/spritesheets/shadow" "$ASSETS_DIR/accessories/" 2>/dev/null || true

# Copy credits if not already present
if [ ! -f "$ASSETS_DIR/CREDITS.csv" ]; then
  cp "$TEMP_DIR/CREDITS.csv" "$ASSETS_DIR/"
fi

# Cleanup
echo "Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

# Report results
echo ""
echo "Asset fetch complete!"
echo ""
echo "Directory sizes:"
du -sh "$ASSETS_DIR"/*/ 2>/dev/null | sort -hr

echo ""
echo "Total:"
du -sh "$ASSETS_DIR"

echo ""
echo "See ATTRIBUTION.md for licensing requirements."
