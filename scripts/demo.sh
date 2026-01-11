#!/usr/bin/env bash
#
# Reckoning RPG Demo Script
# Showcases Phase 1 features: TTS Engine, Game Engine Core, and DM Interface
#

set -e

# Load .env file if it exists
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Print with styling
banner() {
    echo ""
    echo -e "${PURPLE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║${NC}${BOLD}  $1${NC}"
    echo -e "${PURPLE}╚════════════════════════════════════════════════════════════════╝${NC}"
}

section() {
    echo ""
    echo -e "${CYAN}▶ ${BOLD}$1${NC}"
    echo -e "${CYAN}────────────────────────────────────────${NC}"
}

info() {
    echo -e "${BLUE}  ℹ ${NC}$1"
}

success() {
    echo -e "${GREEN}  ✓ ${NC}$1"
}

demo_cmd() {
    echo ""
    echo -e "${YELLOW}  \$ $1${NC}"
    eval "$1" 2>&1 | sed 's/^/    /'
}

# Pretty print JSON with syntax highlighting
pretty_json() {
    local json="$1"
    local max_lines="${2:-30}"

    if command -v jq &> /dev/null; then
        echo "$json" | jq -C '.' 2>/dev/null | head -n "$max_lines" | sed 's/^/    /'
        local total_lines=$(echo "$json" | jq '.' 2>/dev/null | wc -l)
        if [ "$total_lines" -gt "$max_lines" ]; then
            echo -e "    ${PURPLE}... ($(($total_lines - $max_lines)) more lines)${NC}"
        fi
    else
        echo "$json" | head -n "$max_lines" | sed 's/^/    /'
    fi
}

# Fetch and pretty print JSON from API
api_fetch() {
    local endpoint="$1"
    local max_lines="${2:-30}"
    local port=$(cat .server-port 2>/dev/null || echo 3001)
    local response

    echo ""
    echo -e "${YELLOW}  GET ${endpoint}${NC}"
    echo ""

    response=$(curl -s "http://localhost:${port}${endpoint}" 2>/dev/null)

    if [ -z "$response" ]; then
        echo -e "    ${RED}Server not running - start with: just dev${NC}"
    else
        pretty_json "$response" "$max_lines"
    fi
}

# Show example JSON with syntax highlighting
example_json() {
    local label="$1"
    local json="$2"

    echo ""
    echo -e "${YELLOW}  ${label}${NC}"
    echo ""
    if command -v jq &> /dev/null; then
        echo "$json" | jq -C '.' 2>/dev/null | sed 's/^/    /'
    else
        echo "$json" | sed 's/^/    /'
    fi
}

wait_key() {
    echo ""
    echo -e "${PURPLE}  Press Enter to continue...${NC}"
    read -r
}

# Check for required tools
check_prereqs() {
    banner "THE RECKONING - Phase 1 Demo"

    echo ""
    echo -e "  ${BOLD}\"You are not who you think you are,"
    echo -e "   and you will be judged by who you actually became.\"${NC}"
    echo ""

    section "Checking Prerequisites"

    if command -v pnpm &> /dev/null; then
        success "pnpm installed: $(pnpm --version)"
    else
        echo -e "${RED}  ✗ pnpm not found${NC}"
        exit 1
    fi

    if command -v docker &> /dev/null; then
        success "Docker installed: $(docker --version | cut -d' ' -f3 | tr -d ',')"
    else
        echo -e "${RED}  ✗ Docker not found${NC}"
        exit 1
    fi

    if [ -n "$ELEVENLABS_API_KEY" ]; then
        success "ElevenLabs API key configured"
    else
        info "ElevenLabs API key not set (TTS demo will be limited)"
    fi
}

# Demo the TTS system
demo_tts() {
    banner "Text-to-Speech Engine"

    section "Voice Roles & Configuration"
    info "Reckoning uses distinct voices for different narrative roles:"
    echo ""
    echo -e "    ${BOLD}narrator${NC}     - Main storyteller voice (calm, authoritative)"
    echo -e "    ${BOLD}judge${NC}        - The entity that judges your character"
    echo -e "    ${BOLD}npc${NC}          - Non-player character dialogue"
    echo -e "    ${BOLD}inner_voice${NC}  - Character's internal thoughts"

    wait_key

    section "Fetching Available Voices"
    info "Querying ElevenLabs for available voices..."
    api_fetch "/api/tts/voices" 25

    wait_key

    section "Voice Presets"
    info "Each role has presets that control speech characteristics:"
    api_fetch "/api/tts/presets" 40

    wait_key

    section "Current Voice Configuration"
    info "Role-to-voice mappings and default settings:"
    api_fetch "/api/tts/config" 35

    wait_key

    section "TTS Generation Example"
    info "Generating speech with the narrator voice..."
    info "(Audio would play in the browser client)"
    example_json "POST /api/tts/speak" '{
      "text": "The torchlight flickers against stone walls, casting dancing shadows that seem to whisper of ancient secrets.",
      "role": "narrator",
      "preset": "chronicle",
      "cache": true
    }'
}

# Demo the game engine
demo_game_engine() {
    banner "Game Engine Core"

    section "Architecture Overview"
    echo ""
    cat << 'EOF'
    ┌─────────────────────────────────────────────────────────┐
    │                   GAME ENGINE                           │
    ├─────────────────────────────────────────────────────────┤
    │                                                         │
    │   ContentPipeline ──► AI Generation (Claude)            │
    │        │                    │                           │
    │        ▼                    ▼                           │
    │   EventLoop        DM Review Interface                  │
    │        │                    │                           │
    │        ▼                    ▼                           │
    │   StateManager ◄── Accept/Edit/Regenerate/Inject        │
    │        │                                                │
    │        ▼                                                │
    │   Database (SQLite) ──► Canonical Event History         │
    │                                                         │
    └─────────────────────────────────────────────────────────┘
EOF

    wait_key

    section "Content Generation Types"
    info "The AI generates different types of content based on game state:"
    echo ""
    echo -e "    ${BOLD}narration${NC}              Scene descriptions and atmosphere"
    echo -e "    ${BOLD}npc_response${NC}           NPC reactions and dialogue"
    echo -e "    ${BOLD}environment_reaction${NC}   World responds to player actions"
    echo -e "    ${BOLD}dm_continuation${NC}        Suggestions for next story beats"

    wait_key

    section "DM Actions"
    info "The human DM reviews all AI content before it becomes canon:"
    echo ""
    echo -e "    ${GREEN}Accept${NC}      → Content becomes part of game history"
    echo -e "    ${YELLOW}Edit${NC}        → Modify content before accepting"
    echo -e "    ${BLUE}Regenerate${NC}  → Request new generation with feedback"
    echo -e "    ${PURPLE}Inject${NC}      → Add custom content directly"

    wait_key

    section "Playback Modes"
    info "Control how the narrative progresses:"
    echo ""
    echo -e "    ${GREEN}Auto${NC}     Game continues automatically after each action"
    echo -e "    ${YELLOW}Paused${NC}   Wait for explicit DM action"
    echo -e "    ${BLUE}Step${NC}     Advance one beat at a time"
    echo -e "    ${RED}Stopped${NC}  Completely halted"
}

# Demo the database layer
demo_database() {
    banner "Persistence Layer"

    section "Repository Classes"
    info "SQLite-backed repositories for game state:"
    echo ""
    echo -e "    ${BOLD}GameRepository${NC}         Active game sessions"
    echo -e "    ${BOLD}EventRepository${NC}        Canonical event history"
    echo -e "    ${BOLD}AreaRepository${NC}         World geography & details"
    echo -e "    ${BOLD}PartyRepository${NC}        Player characters"
    echo -e "    ${BOLD}SaveRepository${NC}         Save/load slots"
    echo -e "    ${BOLD}EditorStateRepository${NC}  DM editor state"

    wait_key

    section "Canonical Events"
    info "Every accepted action is recorded with full context:"
    example_json "CanonicalEvent" '{
      "id": "evt_abc123",
      "gameId": "game_xyz",
      "turn": 15,
      "timestamp": "2026-01-11T10:30:00Z",
      "eventType": "party_action",
      "content": "Kira draws her blade, stepping between the merchant and the bandits.",
      "locationId": "area_market_square",
      "witnesses": ["npc_merchant", "npc_bandit_leader", "npc_guard"]
    }'
    echo ""
    info "Witnesses remember differently - this feeds the Reckoning!"
}

# Demo the client UI
demo_client() {
    banner "Client Interface"

    section "Two-Panel Layout"
    echo ""
    cat << 'EOF'
    ┌────────────────────────────┬────────────────────────────┐
    │                            │                            │
    │    NARRATOR OUTPUT         │    DM EDITOR               │
    │                            │                            │
    │  • Scrolling narrative     │  • Content textarea        │
    │  • Color-coded by type     │  • Event metadata          │
    │  • TTS playback indicator  │  • Status display          │
    │  • Auto-scroll toggle      │  • Loading state           │
    │                            │                            │
    │                            ├────────────────────────────┤
    │                            │    PLAYBACK CONTROLS       │
    │                            │  [Auto] [Pause] [Step]     │
    │                            ├────────────────────────────┤
    │                            │    ACTION BUTTONS          │
    │                            │  [Accept] [Edit] [Regen]   │
    └────────────────────────────┴────────────────────────────┘
EOF

    wait_key

    section "Real-time Updates (SSE)"
    info "Server-Sent Events keep the client synchronized:"
    echo ""
    echo -e "    ${BOLD}generation:started${NC}   New content being generated"
    echo -e "    ${BOLD}generation:complete${NC}  Content ready for review"
    echo -e "    ${BOLD}state:changed${NC}        Game state updated"
    echo -e "    ${BOLD}editor:state${NC}         DM editor state sync"
    echo -e "    ${BOLD}tts:started${NC}          Audio playback beginning"
    echo -e "    ${BOLD}tts:complete${NC}         Audio playback finished"

    wait_key

    section "SSE Event Example"
    info "When AI generates new content, clients receive:"
    example_json "generation:complete" '{
      "type": "generation:complete",
      "gameId": "game_xyz",
      "timestamp": "2026-01-11T10:30:15Z",
      "data": {
        "id": "gen_789",
        "generationType": "narration",
        "eventType": "narration",
        "content": "The merchant looks up with weary eyes, a flicker of hope crossing his weathered face.",
        "metadata": {
          "speaker": null,
          "mood": "hopeful",
          "intensity": 0.6
        }
      }
    }'
}

# Run the servers
start_demo_servers() {
    banner "Starting Demo Servers"

    section "Infrastructure"
    info "Checking Redis..."
    if docker ps | grep -q reckoning-redis; then
        success "Redis is running"
    else
        info "Starting Redis..."
        just infra-up
        success "Redis started"
    fi

    wait_key

    section "Starting Development Servers"
    info "This will start both the API server and client dev server"
    echo ""
    echo -e "    ${YELLOW}Run in a separate terminal:${NC}"
    echo -e "    ${BOLD}just dev${NC}"
    echo ""
    echo -e "    ${YELLOW}Then open in browser:${NC}"
    echo -e "    ${BOLD}http://localhost:5173${NC}"
}

# Main demo flow
main() {
    cd "$(dirname "$0")/.." || exit 1

    check_prereqs
    wait_key

    demo_tts
    wait_key

    demo_game_engine
    wait_key

    demo_database
    wait_key

    demo_client
    wait_key

    start_demo_servers

    banner "Demo Complete!"

    echo ""
    echo -e "  ${BOLD}Phase 1 Features Demonstrated:${NC}"
    echo ""
    echo -e "    ✓ Text-to-Speech with ElevenLabs integration"
    echo -e "    ✓ Multiple voice roles and presets"
    echo -e "    ✓ Redis caching with graceful fallback"
    echo -e "    ✓ Game Engine with AI content generation"
    echo -e "    ✓ DM editorial workflow (Accept/Edit/Regenerate/Inject)"
    echo -e "    ✓ Playback mode controls"
    echo -e "    ✓ SQLite persistence layer"
    echo -e "    ✓ Real-time SSE updates"
    echo -e "    ✓ Two-panel responsive UI"
    echo ""
    echo -e "  ${BOLD}What's Next:${NC}"
    echo ""
    echo -e "    • Run ${CYAN}just dev${NC} to start the servers"
    echo -e "    • Open ${CYAN}http://localhost:5173${NC} in your browser"
    echo -e "    • Click 'New Game' to begin"
    echo ""
    echo -e "  ${PURPLE}\"Your actions will be remembered.\"${NC}"
    echo ""
}

# Handle command line args
case "${1:-}" in
    --tts)
        demo_tts
        ;;
    --engine)
        demo_game_engine
        ;;
    --db)
        demo_database
        ;;
    --ui)
        demo_client
        ;;
    *)
        main
        ;;
esac
