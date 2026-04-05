# SNES SimCity Revival: Design Analysis & Next Steps

## Current State Analysis

The current project is a solid foundation for a retro city builder. Built in Phaser 3 with TypeScript, it successfully implements:
*   **Core Systems:** A tile-based orthogonal grid map (`CityMap`), basic placement of infrastructure (roads, power lines) and 3x3 zones (Residential, Commercial, Industrial, Power Plants).
*   **Fundamental Simulation:** An early simulation loop (`Simulation.ts`) that manages time (months/years), tracks funds, calculates population based on built zones, and implements a rudimentary RCI demand system aiming for a 3:1:1 ratio.
*   **Basic Infrastructure:** A flood-fill algorithm for distributing power from plants across contiguous power lines and zones.

**Alignment with SNES SimCity:**
The top-down perspective, the reliance on 3x3 zoning blocks, and the basic RCI mechanics align well with the 1991 SNES release. However, to truly capture the SNES feel, the simulation lacks the underlying complex layers that govern city growth (traffic, pollution, land value). The presentation is also missing the iconic character and feedback loops that defined the console experience, such as the advisor.

---

## Proposed Next Steps

Based on the goal of aligning with the SNES experience and prioritizing major simulation systems for a solo developer, here are the three highest-impact development steps:

### Step 1: Implement Traffic Simulation and Commute Logic

**Rationale:**
In SNES SimCity, roads are not just requirements for zoning; they are dynamic pathways that generate traffic. Traffic is a critical simulation layer that dictates the success of Commercial and Industrial zones and negatively impacts Residential zones via pollution. Without traffic simulation, the spatial arrangement of the city doesn't matter much beyond simple adjacency. This is the most crucial missing "major simulation stuff."

**Specific Actions:**
*   **Add Traffic Grid:** Introduce a `trafficGrid` (number[][]) in `CityData.ts` to store traffic density for each tile.
*   **Pathfinding/Commute Check:** In the `Simulation.tick()`, when evaluating a Residential zone's growth, implement a basic "commute" algorithm: attempt to trace a path along connected roads from the Residential zone to an Industrial or Commercial zone within a certain distance.
*   **Generate Traffic Density:** If a valid commute path is found, increase the `trafficGrid` values for the road tiles along that path. High traffic on a road tile should eventually influence its visual state (e.g., adding moving car sprites or turning the road darker).

**Expected Outcome:**
The layout of the city will now matter. Players will have to carefully design road networks to avoid massive congestion, making the game a true planning puzzle rather than just placing blocks.

### Step 2: Implement Pollution and Land Value Grids

**Rationale:**
Land value is the driving force behind high-density, wealthy development (those iconic SNES high-rises). Land value is determined by a combination of positive factors (water, parks, city center proximity) and negative factors (pollution from industry and traffic, crime). Currently, zones simply grow randomly if powered. Introducing these grids brings the core challenge of SNES SimCity to life: keeping citizens happy while maintaining a functional industrial base.

**Specific Actions:**
*   **Add Data Grids:** Create `pollutionGrid` and `landValueGrid` in `CityData.ts`.
*   **Pollution Diffusion:** During the simulation tick, generate pollution at Industrial zones, Power Plants, and heavily trafficked roads. Use a cellular automata or simple diffusion algorithm to spread pollution to adjacent tiles, decreasing over distance.
*   **Calculate Land Value:** Calculate land value for each tile based on its distance to the map center, proximity to water/trees (if added), minus the local `pollutionGrid` value. Use this `landValueGrid` to determine if a zone upgrades to a higher visual tier (e.g., slum vs. luxury home).

**Expected Outcome:**
The simulation gains immense depth. Players will be forced to separate residential areas from industrial zones and manage traffic flow to protect land values, mimicking the core gameplay loop of the original SNES title.

### Step 3: Introduce the Advisor System (Dr. Wright implementation)

**Rationale:**
The SNES version is beloved largely because of its presentation, specifically the charismatic advisor, Dr. Wright. His pop-ups provide crucial feedback on the simulation (e.g., "Citizens demand a stadium!", "Traffic is terrible!"). Currently, the game has UI text, but no character or direct feedback loop. Implementing an advisor bridges the gap between complex simulation data and the player experience.

**Specific Actions:**
*   **Create Advisor UI Overlay:** Build a new UI component in `MainUI.ts` that features a portrait area (for a Dr. Wright-style character sprite) and a dialogue box.
*   **Implement Trigger Logic:** In `Simulation.ts`, add checks at the end of the month/year to evaluate city state against thresholds. For example: if average pollution > X, trigger the "Pollution Warning" event; if population crosses 10,000, trigger "Town Upgraded" event.
*   **Message Queue:** Create an event queue system so that if multiple issues happen simultaneously, the advisor messages are displayed sequentially to the player, requiring a click to dismiss.

**Expected Outcome:**
The game will feel significantly more alive and distinctly "Nintendo." Players will receive actionable feedback tied to the new Traffic and Pollution systems, making the complex simulation data understandable and engaging.
