# Agent Guide: SimCity Web

This is a TypeScript/Phaser 3 web game - a SNES SimCity revival city builder with simulation mechanics, traffic, pollution, land value, disasters, and a full RCI (Residential/Commercial/Industrial) demand system.

## Essential Commands

```bash
# Development
npm run dev          # Start Vite dev server (http://localhost:5173)

# Build & Production
npm run build        # TypeScript compile + Vite build
npm run preview      # Preview production build
```

**Note**: No test script is defined in package.json. Test files (`test_*.py`) exist but use Playwright and must be run manually with `python test_*.py` (requires Playwright Python package).

## Project Architecture

### High-Level Structure

```
src/
├── main.ts                 # Entry point - initializes Phaser game with scenes
├── core/
│   ├── Config.ts          # GAME_CONFIG (800x600, pixel art, FIT scaling)
│   └── InputManager.ts     # Keyboard/mouse/gamepad input handling
├── simulation/
│   ├── CityData.ts         # Central data store + tile type constants + auto-tiling
│   └── Simulation.ts       # Main simulation engine (1 tick = 1 month)
├── game/
│   ├── AudioManager.ts     # Procedural audio using Web Audio API
│   └── scenes/
│       ├── BootScene.ts    # Asset loading + scene initialization
│       ├── CityMap.ts       # Main game scene (rendering, placement)
│       ├── MainUI.ts        # UI scene (tools, HUD, RCI, advisor)
│       └── EvaluationUI.ts  # Graph/charts overlay
```

### Scene Architecture (Phaser 3)

- **BootScene**: Loads tilesets, generates advisor sprite texture, launches CityMap and MainUI
- **CityMap**: Active game scene - handles tilemap rendering, input processing, tile placement, camera control
- **MainUI**: Overlays CityMap - provides tool selection, HUD stats, RCI demand meter, advisor messages
- **EvaluationUI**: Pop-up scene showing history graphs when triggered

Scenes communicate via:
- Custom events (`window.dispatchEvent` + CustomEvent for advisor messages)
- Phaser scene events (`scene.events.emit('toolChanged')`, `scene.events.emit('openEvaluation')`)
- Direct scene references (`this.scene.get('MainUI') as MainUI`)

### Data Model (CityData)

Central store with multiple parallel grids (all `number[y][x]` or `boolean[y][x]`):

| Grid | Purpose | Type |
|------|---------|------|
| `typeGrid` | Generic tile type for connection logic | `number[][]` |
| `frameGrid` | Actual visual frame index for Phaser rendering | `number[][]` |
| `powerGrid` | Power propagation state | `boolean[][]` |
| `trafficGrid` | Traffic density (0-100+) | `number[][]` |
| `pollutionGrid` | Pollution level (0-100+) | `number[][]` |
| `landValueGrid` | Land value modifier (positive/negative) | `number[][]` |
| `crimeGrid` | Crime level (0-100+) | `number[][]` |

Additional state:
- `funds`: Money (starts at $20,000)
- `population`: Citizen count
- `dateMonth/dateYear`: Time tracking (1 simulation tick = 1 month)
- `demandR/demandC/demandI`: RCI demand (-1.0 to 1.0)
- `unlockedGifts/placedGifts`: Set-based tracking of unlockable buildings
- `history`: Array of yearly metrics for evaluation graphs
- `taxRate`: Tax rate (default 7%)

### Simulation Loop (Simulation.tick())

Runs every 1 second (1000ms timer in CityMap). Each tick = 1 month.

**Sequence**:
1. Advance time, process year-end budget if month > 12
2. Update audio tier based on population
3. Check gift unlocks (Mayor's House at 2k pop, Casino when funds < 5k, Amusement Park at 10k)
4. Calculate power grid (BFS flood fill from power plants)
5. Decay traffic/pollution/crime grids
6. Calculate city services (police station auras reduce crime)
7. Calculate terrain auras (water/parks/trees boost land value)
8. Process fires (spread to adjacent flammable tiles, extinguish if in fire station range)
9. Iterate all tiles:
   - Generate crime in dense areas (med/high density R/C)
   - Calculate land value (base + terrain - pollution - crime)
   - Generate pollution from industry/power plants/high-traffic roads
   - Tally population and zone counts
   - Run commute logic for 50% of residential tiles (BFS to find C/I zones, apply traffic to path)
   - Process growth/decay for 3x3 zones (only on top-left tile: dx===0 && dy===0)
10. Diffuse pollution (cellular automata spread)
11. Randomly spawn fires (rare, more likely with high crime/pollution)
12. Update population and RCI demand
13. Trigger advisor events via CustomEvent

**Critical Performance Note**: When iterating BFS queues, always use a head index increment instead of `shift()`. The current code uses `while(head < queue.length) { const current = queue[head++]; ... }` which is O(1) per iteration. Using `shift()` is O(N) and causes massive lag at large map sizes.

## Code Patterns & Conventions

### TypeScript Configuration

- Strict mode enabled
- `useDefineForClassFields: true`
- `verbatimModuleSyntax: true` (no `import type`)
- Module resolution: bundler mode
- Target: ES2023, Module: ESNext

### Phaser Patterns

**Scene Initialization**:
```typescript
export class MyScene extends Phaser.Scene {
    constructor() {
        super('MyScene'); // Must have unique key
    }

    create() {
        // Load/create game objects
    }
}
```

**Scene Launching**:
- `this.scene.start('NextScene')` - Switch to new scene
- `this.scene.launch('OverlayScene')` - Run scene concurrently
- `this.scene.get('OverlayScene')` - Get reference to active scene

**Tilemap with Phaser**:
```typescript
const map = this.make.tilemap({ tileWidth: 16, tileHeight: 16, width: 50, height: 50 });
const tileset = map.addTilesetImage('tiles', 'tiles', 16, 16, 0, 0);
const layer = map.createBlankLayer('CityLayer', tileset, 0, 0);
layer.fill(0); // Fill with grass
```

**Camera Setup**:
```typescript
this.cameras.main.setBounds(0, 0, mapWidth * tileSize, mapHeight * tileSize);
this.cameras.main.setZoom(2); // Scale up 2x
this.cameras.main.centerOn(...);
```

### 3x3 Zone System

**Zone Structure**:
- Zones (Residential, Commercial, Industrial, Police, Fire, Airport, Seaport, etc.) are 3x3 blocks
- Each tile in the block has a different frame index calculated as: `baseType + (cy * 16) + cx`
- Only process the block once when the top-left tile (dx===0 && dy===0) is encountered

**Placement**:
```typescript
for (let cy = 0; cy < 3; cy++) {
    for (let cx = 0; cx < 3; cx++) {
        const frameId = currentTool + (cy * 16) + cx;
        this.cityData.setTile(x + cx, y + cy, currentTool, false);
        this.cityData.frameGrid[y + cy][x + cx] = frameId;
    }
}
```

**Bulldozing 3x3 Zones**:
Must find the top-left origin before removing:
```typescript
const frame = this.cityData.getFrame(x, y);
const offset = frame - targetType;
const dy = Math.floor(offset / 16);
const dx = offset % 16;
originX = x - dx;
originY = y - dy;
// Then remove all 9 tiles from origin
```

### Auto-Tiling System (Bitmask)

Used for roads, power lines, rails, and bridges.

**Bitmask Values**: N=1, E=2, S=4, W=8

**Frame Selection**:
```typescript
let mask = 0;
if (this.isConnectable(x, y - 1, type)) mask |= 1;  // North
if (this.isConnectable(x + 1, y, type)) mask |= 2;  // East
if (this.isConnectable(x, y + 1, type)) mask |= 4;  // South
if (this.isConnectable(x - 1, y, type)) mask |= 8;  // West
this.frameGrid[y][x] = type + mask; // Frame = base + mask (0-15 variations)
```

**Connectable Types**:
- Same type connects to itself
- Road connects to Bridge_Road
- Rail connects to Bridge_Rail
- Power lines connect to zones (RES_EMPTY through BRIDGE_ROAD)
- Rails connect to Train Depot

### Tile Type Constants (TILE_TYPES)

All tile types are defined in `CityData.ts` as numeric constants:

- **Terrain**: GRASS(0), DIRT(1), WATER(2), TREE(3), PARK(4), FIRE(5)
- **Infrastructure**: ROAD_BASE(16), POWER_LINE_BASE(32), RAIL_BASE(240)
- **Bridges**: BRIDGE_ROAD(224), BRIDGE_RAIL(256)
- **Zones**: RES_EMPTY(48), RES_LOW(51), RES_MED(54), RES_HIGH(57), COM_EMPTY(60), COM_LOW(96), etc.
- **Buildings**: POWER_PLANT(150), POLICE_STATION(153), FIRE_STATION(156), TRAIN_DEPOT(192), SEAPORT(195), AIRPORT(198)
- **Gifts**: MAYOR_HOUSE(201), CASINO(204), AMUSEMENT_PARK(207)

**Important**: 3x3 zones span from RES_EMPTY(48) to just before BRIDGE_ROAD(224). The ranges are:
- Row 3 (48-63): Residential + empty Commercial
- Row 6 (96-111): Commercial low/med/high + empty Industrial
- Row 9 (144-159): Industrial + power plant + police + fire
- Row 12 (192-207): Train depot, seaport, airport, gifts

### Tool Costs

Defined in `CityData.ts` as `TOOL_COSTS` object mapping TILE_TYPES to costs. Also duplicated in `CityMap.ts.getToolCost()` method (the duplication appears to be intentional for safety).

**Cost Examples**:
- Bulldoze: $1
- Road: $10
- Power Line: $5
- Zones (R/C/I): $100
- Power Plant: $3000
- Seaport: $3000
- Airport: $10000
- Gifts (Mayor's House, Casino, Amusement Park): Free (when unlocked)

### Input Handling (InputManager)

**Supports**:
- Keyboard: Arrow keys or WASD for movement, Space for action
- Mouse: Move cursor, left click to place/paint, right click drag to pan camera
- Gamepad: D-pad or left stick to move, A button to place, L1/R1 to cycle tools

**Throttling**: Gamepad/key movement is throttled to 150ms between moves to prevent rapid cursor movement.

**Dual Control**: Mouse and keyboard/gamepad seamlessly blend - if mouse moves, the internal cursor position updates to match, allowing gamepad to take over from that position.

### Audio (AudioManager)

Uses Web Audio API with procedural sound generation (no external audio files).

**Init**: Must be triggered by user gesture (first click/key press)
- BGM: Generative drone that grows more complex with population tiers
- Effects: Play Tones (click, build, bulldoze, alert, error)

**Population Tiers**:
- Tier 0 (Village): Single drone (A2 = 110Hz)
- Tier 1 (Town, >2k): + Perfect 5th
- Tier 2 (City, >10k): + Octave
- Tier 3 (Metropolis, >100k): + Major 3rd above octave

### Event System

**Custom Events (window.dispatchEvent)**:
- `advisorEvent`: Advisor messages, budget reports, disaster alerts
  - Structure: `{ message?: string, disaster?: string, budgetReport?: boolean, taxes?, upkeep?, net?, funds?, population?, ... }`

**Phaser Scene Events**:
- `toolChanged`: When switching between 1x1 and 3x3 tools
- `openEvaluation`: Request to open evaluation graph
- `viewModeChanged`: Toggle between Normal and Pollution view modes

## Key Gotchas & Non-Obvious Patterns

### 1. BFS Queue Performance

**Critical**: Never use `queue.shift()` in BFS loops. It's O(N) and causes massive lag. Use head index:

```typescript
// CORRECT (O(1) per iteration)
let head = 0;
while(head < queue.length) {
    const current = queue[head++];
    // ... process current
}

// WRONG (O(N) per iteration - terrible performance)
while(queue.length > 0) {
    const current = queue.shift();  // DO NOT DO THIS
    // ... process current
}
```

This is used in:
- `calculatePowerGrid()` - Power flood fill
- `calculateCommute()` - Traffic pathfinding

### 2. 3x3 Zone Processing

When iterating through the map, 3x3 zones should only be processed once (on the top-left tile) to avoid redundant work:

```typescript
const frame = this.cityData.getFrame(x, y);
const offset = frame - type;
const dy = Math.floor(offset / 16);
const dx = offset % 16;

if (dx === 0 && dy === 0) {
    // This is the top-left tile of the 3x3 block - process here
}
```

If you process all 9 tiles independently, you'll apply growth/decay 9 times instead of once.

### 3. Power Grid Flood Fill Logic

Power only conducts through:
- `POWER_LINE_BASE` tiles
- `POWER_PLANT` tiles (sources)
- Zone tiles (RES_EMPTY through BRIDGE_ROAD) - i.e., all buildings/zones

Power does NOT conduct through roads, rails, parks, trees, or terrain tiles.

### 4. Commute Logic Performance

The commute logic (`calculateCommute`) only runs for 50% of residential tiles each tick (`if (Math.random() < 0.5)`) to save performance. Running it for every tile every tick would be too expensive.

The BFS search is limited to `MAX_DISTANCE = 40` tiles to prevent runaway searches.

### 5. Traffic vs Pollution Interaction

High traffic (threshold > 20) generates additional pollution on road tiles. This creates a feedback loop:
- More traffic → More pollution → Lower land value → Zones decay → Less traffic

### 6. Fire Mechanics

- Fires spread to adjacent flammable tiles (everything except WATER, DIRT, GRASS, FIRE, ROAD, RAIL, BRIDGE, POWER_LINE)
- Fire stations (radius 15) extinguish fires immediately if powered
- Fires have 20% chance per tick to burn out on their own
- Fires only spawn randomly if no existing fires are on the map

### 7. Gift Unlocks

Gifts are tracked with Sets (`unlockedGifts`, `placedGifts`). When placing a gift (type >= MAYOR_HOUSE), check both:
- Is it unlocked? (`unlockedGifts.has(type)`)
- Is it already placed? (`placedGifts.has(type)` - only 1 of each allowed)

### 8. Bridge Auto-Swapping

When placing roads or rails on water tiles, the game automatically upgrades to bridge tiles (BRIDGE_ROAD or BRIDGE_RAIL) if the player has sufficient funds. The cost check happens in `placeTile()` before calling `getToolCost()`.

### 9. Tileset Layout

The tileset is 16 columns wide. Maximum of 5 blocks per row (indices 0, 3, 6, 9, 12) for 3x3 zones. This is why frame calculation uses `(cy * 16) + cx` - jumping by 16 columns each row.

### 10. View Mode Toggle

Pressing 'V' toggles between Normal and Pollution view modes. This changes how tiles are rendered in `tickSimulation()`:
- Normal: Shows power (gray tint if unpowered), traffic (darken roads with traffic), trees/parks (color tints)
- Pollution: Shows pollution overlay (red/yellow/white based on pollution level)

### 11. RCI Demand System

Target ratios: 50% Residential, 20% Commercial, 30% Industrial

Demand modifiers:
- Tax rate: 7% is neutral. Higher = lower demand. Formula: `(0.07 - taxRate) * 10`
- Airport required for high Commercial demand
- Seaport required for high Industrial demand
- Small random baseline to prevent total stall

### 12. Land Value Calculation

Formula: `base = 60 - (distanceToCenter * 0.5) - pollution - crime + terrainBoosts`

- Distance to center creates a "downtown" effect
- Pollution and crime are negative modifiers
- Terrain (water, parks, trees, mayor's house, amusement park) add positive auras
- Thresholds: >35 for high density, >20 for medium density, >10 for low density

### 13. Advisor Event Queue

Advisor messages are queued in MainUI. If multiple events trigger, they display sequentially with user dismissal. This is handled in the MainUI scene logic (not fully shown in the limited view).

### 14. Gamepad Tool Cycling

Gamepad L1/R1 buttons trigger `prevTool`/`nextTool` events. This requires the UI scene to be listening and updating the tool selection accordingly.

## Testing

Test files exist but are not integrated into npm scripts:

```bash
# Manual testing with Playwright (requires installation)
python test_hang.py     # Basic click test
python test_crash.py    # Place power plant test
python test_drag.py     # Drag painting test
python test_offset.py  # Not reviewed but likely tests coordinate offset
```

Tests use Playwright Python to automate browser interactions at http://localhost:5173

## Assets

**Tilesets** (loaded in BootScene):
- `/tileset_v2.png` - Main 16x16 tile spritesheet
- `/ui_icons_v2.png` - UI icons (32x32)

**Generated Assets**:
- Advisor sprite is procedurally generated using Phaser Graphics in BootScene

All assets are served from the `public/` directory.

## Development Notes

- Map size is hardcoded to 50x50 tiles (mapWidth, mapHeight in CityMap)
- Tile size is 16px (pixelArt = true)
- Camera zoom starts at 2x
- Simulation tick rate is 1000ms (configurable in CityMap.create())
- Default tax rate is 7%
- Default starting funds is $20,000

## Future Work (from DESIGN_PROPOSALS.md)

The design doc outlines three high-priority features to better align with SNES SimCity:
1. **Traffic Simulation and Commute Logic** - Already implemented with BFS pathfinding
2. **Pollution and Land Value Grids** - Already implemented with diffusion and auras
3. **Advisor System** - Partially implemented (basic messages exist, but full Dr. Wright character not complete)

All three proposed features are already implemented in the codebase, suggesting this is a relatively mature prototype. Further development might focus on:
- More sophisticated traffic AI
- More disaster types
- Enhanced advisor system with character portraits and voice
- Multiplayer or save/load functionality
- More building types and zone variations
- Improved visual feedback and animations
