#!/usr/bin/env bash
#
# Documentation Linter for Reckoning
# Validates frontmatter in markdown files
#
# Usage:
#   ./scripts/lint-docs.sh [--fix] [--verbose] [path...]
#
# Options:
#   --fix      Auto-fix missing updated dates
#   --verbose  Show all files, not just errors
#   path...    Specific files to lint (default: all .md files)

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Valid values
VALID_TYPES="vision plan adr guide reference meta contributing agent"
VALID_STATUSES="draft active review deprecated superseded"

# Options
FIX_MODE=false
VERBOSE=false
ERROR_COUNT=0
WARN_COUNT=0
FILES_CHECKED=0

# Parse arguments
PATHS=()
for arg in "$@"; do
    case $arg in
        --fix)
            FIX_MODE=true
            ;;
        --verbose)
            VERBOSE=true
            ;;
        *)
            PATHS+=("$arg")
            ;;
    esac
done

# Find markdown files
if [ ${#PATHS[@]} -eq 0 ]; then
    # Default: all markdown files except node_modules and templates
    mapfile -t FILES < <(find . -name "*.md" -type f \
        ! -path "./node_modules/*" \
        ! -path "./packages/*/node_modules/*" \
        ! -name "_template.md" \
        2>/dev/null | sort)
else
    FILES=("${PATHS[@]}")
fi

# Helper functions
log_error() {
    echo -e "${RED}ERROR${NC}: $1: $2"
    ((ERROR_COUNT++))
}

log_warn() {
    echo -e "${YELLOW}WARN${NC}: $1: $2"
    ((WARN_COUNT++))
}

log_ok() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${GREEN}OK${NC}: $1"
    fi
}

log_info() {
    echo -e "${BLUE}INFO${NC}: $1"
}

# Extract frontmatter from file
get_frontmatter() {
    local file="$1"
    # Extract content between --- markers
    awk '/^---$/{p=!p; if(p) next; else exit} p' "$file" 2>/dev/null
}

# Check if file has frontmatter
has_frontmatter() {
    local file="$1"
    head -1 "$file" 2>/dev/null | grep -q "^---$"
}

# Get field value from frontmatter
get_field() {
    local frontmatter="$1"
    local field="$2"
    echo "$frontmatter" | grep "^${field}:" | sed "s/^${field}:[[:space:]]*//" | tr -d '"'
}

# Validate date format
is_valid_date() {
    local date="$1"
    [[ "$date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]
}

# Check if value is in list
is_valid_enum() {
    local value="$1"
    local valid_values="$2"
    echo "$valid_values" | tr ' ' '\n' | grep -qx "$value"
}

# Main linting function
lint_file() {
    local file="$1"
    local has_error=false

    ((FILES_CHECKED++))

    # Skip certain files
    case "$file" in
        *README.md)
            # READMEs in package directories don't need frontmatter
            if [[ "$file" == *"/packages/"* ]]; then
                log_ok "$file (package readme, skipped)"
                return 0
            fi
            ;;
    esac

    # Check frontmatter exists
    if ! has_frontmatter "$file"; then
        log_error "$file" "Missing frontmatter (must start with ---)"
        return 1
    fi

    local frontmatter
    frontmatter=$(get_frontmatter "$file")

    if [ -z "$frontmatter" ]; then
        log_error "$file" "Empty or malformed frontmatter"
        return 1
    fi

    # Required fields
    local title type status created updated
    title=$(get_field "$frontmatter" "title")
    type=$(get_field "$frontmatter" "type")
    status=$(get_field "$frontmatter" "status")
    created=$(get_field "$frontmatter" "created")
    updated=$(get_field "$frontmatter" "updated")

    # Check required fields
    if [ -z "$title" ]; then
        log_error "$file" "Missing required field: title"
        has_error=true
    fi

    if [ -z "$type" ]; then
        log_error "$file" "Missing required field: type"
        has_error=true
    elif ! is_valid_enum "$type" "$VALID_TYPES"; then
        log_error "$file" "Invalid type '$type'. Valid: $VALID_TYPES"
        has_error=true
    fi

    if [ -z "$status" ]; then
        log_error "$file" "Missing required field: status"
        has_error=true
    elif ! is_valid_enum "$status" "$VALID_STATUSES"; then
        log_error "$file" "Invalid status '$status'. Valid: $VALID_STATUSES"
        has_error=true
    fi

    if [ -z "$created" ]; then
        log_error "$file" "Missing required field: created"
        has_error=true
    elif ! is_valid_date "$created"; then
        log_error "$file" "Invalid date format for 'created'. Use YYYY-MM-DD"
        has_error=true
    fi

    if [ -z "$updated" ]; then
        if [ "$FIX_MODE" = true ]; then
            log_info "$file: Adding missing 'updated' field"
            # This is a simplified fix - in practice you'd want proper YAML manipulation
            log_warn "$file" "Auto-fix for 'updated' not implemented yet"
        else
            log_error "$file" "Missing required field: updated"
        fi
        has_error=true
    elif ! is_valid_date "$updated"; then
        log_error "$file" "Invalid date format for 'updated'. Use YYYY-MM-DD"
        has_error=true
    fi

    # Check related files exist
    local related
    related=$(echo "$frontmatter" | awk '/^related:/,/^[a-z]+:/' | grep "^  - " | sed 's/^  - //')
    if [ -n "$related" ]; then
        local dir
        dir=$(dirname "$file")
        while IFS= read -r rel_path; do
            if [ -n "$rel_path" ]; then
                local full_path="$dir/$rel_path"
                if [ ! -f "$full_path" ]; then
                    log_warn "$file" "Related file not found: $rel_path"
                fi
            fi
        done <<< "$related"
    fi

    if [ "$has_error" = false ]; then
        log_ok "$file"
        return 0
    fi

    return 1
}

# Main
echo "Reckoning Documentation Linter"
echo "=============================="
echo ""

if [ ${#FILES[@]} -eq 0 ]; then
    echo "No markdown files found."
    exit 0
fi

for file in "${FILES[@]}"; do
    lint_file "$file" || true
done

echo ""
echo "=============================="
echo "Files checked: $FILES_CHECKED"
echo -e "Errors: ${RED}$ERROR_COUNT${NC}"
echo -e "Warnings: ${YELLOW}$WARN_COUNT${NC}"

if [ $ERROR_COUNT -gt 0 ]; then
    echo ""
    echo "Run 'just docs-lint --verbose' to see all files"
    exit 1
fi

echo -e "${GREEN}All checks passed!${NC}"
exit 0
