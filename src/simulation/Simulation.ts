import { CityData, TILE_TYPES } from './CityData';

export class Simulation {
    private cityData: CityData;

    constructor(data: CityData) {
        this.cityData = data;
    }

    public tick() {
        // Advance time (1 tick = 1 week approx, 4 ticks = 1 month)
        // For simplicity in MVP, 1 tick = 1 month
        this.cityData.dateMonth++;
        if (this.cityData.dateMonth > 12) {
            this.cityData.dateMonth = 1;
            this.cityData.dateYear++;
            this.processYearEndBudget();
        }

        this.calculatePowerGrid();

        // Decay traffic, pollution, and crime slightly every tick
        this.decayGrids();

        // Calculate service coverage (Police/Fire auras)
        this.calculateCityServices();

        // Calculate terrain/park land value modifiers
        this.calculateTerrainAuras();

        let popCount = 0;
        let builtR = 0;
        let builtC = 0;
        let builtI = 0;

        // Growth and evaluation logic
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                const type = this.cityData.getTile(x, y);
                
                // Generate crime in dense populated areas
                const isIndustry = type >= TILE_TYPES.IND_EMPTY && type <= TILE_TYPES.IND_HIGH;
                const isResidential = type >= TILE_TYPES.RES_EMPTY && type <= TILE_TYPES.RES_HIGH;
                const isCommercial = type >= TILE_TYPES.COM_EMPTY && type <= TILE_TYPES.COM_HIGH;

                if (isResidential || isCommercial) {
                    if (type === TILE_TYPES.RES_MED || type === TILE_TYPES.COM_MED) {
                        this.cityData.crimeGrid[y][x] += 2;
                    } else if (type === TILE_TYPES.RES_HIGH || type === TILE_TYPES.COM_HIGH) {
                        this.cityData.crimeGrid[y][x] += 5;
                    }
                }

                // Calculate local land value (simplified)
                // High pollution and crime drastically reduces land value.
                // Natural features (from the aura calculation) will boost it.
                const pollution = this.cityData.pollutionGrid[y][x];
                const crime = this.cityData.crimeGrid[y][x];

                // Base land value depends on distance from center (simplified "downtown" effect)
                const distToCenter = Math.abs(x - this.cityData.width/2) + Math.abs(y - this.cityData.height/2);
                let landValue = 60 - (distToCenter * 0.5) - pollution - crime + this.cityData.landValueGrid[y][x]; // Add aura boosts

                this.cityData.landValueGrid[y][x] = landValue;

                // Traffic and Pollution generation
                if ((isIndustry && type !== TILE_TYPES.IND_EMPTY) || type === TILE_TYPES.POWER_PLANT) {
                    this.cityData.pollutionGrid[y][x] += 10;
                }

                // Tally existing buildings (based on density)
                if (isResidential) {
                    if (type === TILE_TYPES.RES_LOW) { popCount += 10; builtR++; }
                    if (type === TILE_TYPES.RES_MED) { popCount += 20; builtR += 2; }
                    if (type === TILE_TYPES.RES_HIGH) { popCount += 40; builtR += 4; }
                }
                if (isCommercial) {
                    if (type === TILE_TYPES.COM_LOW) { popCount += 10; builtC++; }
                    if (type === TILE_TYPES.COM_MED) { popCount += 20; builtC += 2; }
                    if (type === TILE_TYPES.COM_HIGH) { popCount += 40; builtC += 4; }
                }
                if (isIndustry && type !== TILE_TYPES.IND_EMPTY) {
                     // Industry doesn't directly add population
                     builtI += (type === TILE_TYPES.IND_LOW ? 1 : type === TILE_TYPES.IND_MED ? 2 : 4);
                }

                // Built zones generate traffic by commuting
                if (isResidential && type !== TILE_TYPES.RES_EMPTY) {
                    if (Math.random() < 0.5) { // Run commute logic for some homes every tick to save perf
                         this.calculateCommute(x, y);
                    }
                }

                // Incremental Growth/Decay Logic
                if (isResidential || isCommercial || isIndustry) {
                    // Find root of 3x3 to only process the block once (when we are on the top-left tile)
                    const frame = this.cityData.getFrame(x, y);
                    const offset = frame - type;
                    const dy = Math.floor(offset / 16);
                    const dx = offset % 16;

                    if (dx === 0 && dy === 0) { // Top-left tile of the 3x3
                        let hasDemand = false;
                        if (isResidential && this.cityData.demandR > 0) hasDemand = true;
                        if (isCommercial && this.cityData.demandC > 0) hasDemand = true;
                        if (isIndustry && this.cityData.demandI > 0) hasDemand = true;

                        // Check environment (needs power, road access, and acceptable land value)
                        const hasPower = this.cityData.powerGrid[y][x];
                        const hasRoad = this.isAdjacentToTransit(x, y) || this.isAdjacentToTransit(x+1, y) || this.isAdjacentToTransit(x+2, y) ||
                                        this.isAdjacentToTransit(x, y+1) || this.isAdjacentToTransit(x+2, y+1) ||
                                        this.isAdjacentToTransit(x, y+2) || this.isAdjacentToTransit(x+1, y+2) || this.isAdjacentToTransit(x+2, y+2);

                        // Res/Com need decent land value to grow/maintain high density
                        const canGrowEnv = isIndustry || landValue > 10;

                        let nextType = type;

                        // Evaluate Growth
                        if (hasPower && hasRoad && canGrowEnv && hasDemand) {
                            if (Math.random() < 0.1) { // 10% chance per month to grow if conditions met
                                if (type === TILE_TYPES.RES_EMPTY) nextType = TILE_TYPES.RES_LOW;
                                else if (type === TILE_TYPES.RES_LOW && landValue > 20) nextType = TILE_TYPES.RES_MED;
                                else if (type === TILE_TYPES.RES_MED && landValue > 35) nextType = TILE_TYPES.RES_HIGH;

                                else if (type === TILE_TYPES.COM_EMPTY) nextType = TILE_TYPES.COM_LOW;
                                else if (type === TILE_TYPES.COM_LOW && landValue > 20) nextType = TILE_TYPES.COM_MED;
                                else if (type === TILE_TYPES.COM_MED && landValue > 35) nextType = TILE_TYPES.COM_HIGH;

                                else if (type === TILE_TYPES.IND_EMPTY) nextType = TILE_TYPES.IND_LOW;
                                else if (type === TILE_TYPES.IND_LOW) nextType = TILE_TYPES.IND_MED;
                                else if (type === TILE_TYPES.IND_MED) nextType = TILE_TYPES.IND_HIGH;
                            }
                        }

                        // Evaluate Decay (if high pollution or no power)
                        if ((!hasPower || landValue < -10) && type !== TILE_TYPES.RES_EMPTY && type !== TILE_TYPES.COM_EMPTY && type !== TILE_TYPES.IND_EMPTY) {
                            if (Math.random() < 0.2) {
                                if (isResidential) {
                                    if (type === TILE_TYPES.RES_HIGH) nextType = TILE_TYPES.RES_MED;
                                    else if (type === TILE_TYPES.RES_MED) nextType = TILE_TYPES.RES_LOW;
                                    else if (type === TILE_TYPES.RES_LOW) nextType = TILE_TYPES.RES_EMPTY;
                                }
                                if (isCommercial) {
                                    if (type === TILE_TYPES.COM_HIGH) nextType = TILE_TYPES.COM_MED;
                                    else if (type === TILE_TYPES.COM_MED) nextType = TILE_TYPES.COM_LOW;
                                    else if (type === TILE_TYPES.COM_LOW) nextType = TILE_TYPES.COM_EMPTY;
                                }
                                if (isIndustry) {
                                    if (type === TILE_TYPES.IND_HIGH) nextType = TILE_TYPES.IND_MED;
                                    else if (type === TILE_TYPES.IND_MED) nextType = TILE_TYPES.IND_LOW;
                                    else if (type === TILE_TYPES.IND_LOW) nextType = TILE_TYPES.IND_EMPTY;
                                }
                            }
                        }

                        // Apply new type to the 3x3 block if it changed
                        if (nextType !== type) {
                            for (let cy = 0; cy < 3; cy++) {
                                for (let cx = 0; cx < 3; cx++) {
                                    if (this.cityData.isValid(x+cx, y+cy)) {
                                        this.cityData.typeGrid[y+cy][x+cx] = nextType;
                                        this.cityData.frameGrid[y+cy][x+cx] = nextType + (cy * 16) + cx;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Diffuse pollution
        this.diffusePollution();

        // Finalize Population (divided by 9 since a 3x3 block is 9 tiles, we counted each tile)
        this.cityData.population = Math.floor(popCount / 9);
        builtR = Math.floor(builtR / 9);
        builtC = Math.floor(builtC / 9);
        builtI = Math.floor(builtI / 9);
        
        this.updateRCI(builtR, builtC, builtI);

        // Trigger Advisor events
        this.evaluateAdvisorEvents();
    }

    private processYearEndBudget() {
        // Calculate taxes (population * basic revenue rate * taxRate)
        const revenuePerCitizen = 10;
        const taxes = Math.floor(this.cityData.population * revenuePerCitizen * this.cityData.taxRate);

        // Calculate upkeep (roads cost money)
        let roadCount = 0;
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                if (this.cityData.getTile(x, y) === TILE_TYPES.ROAD_BASE) {
                    roadCount++;
                }
            }
        }
        const upkeep = roadCount * 2; // $2 per road tile per year

        this.cityData.lastTaxesCollected = taxes;
        this.cityData.lastUpkeepPaid = upkeep;

        this.cityData.funds += (taxes - upkeep);

        // Ensure funds don't go negative, or handle bankruptcy
        if (this.cityData.funds < 0) this.cityData.funds = 0;

        // Dispatch budget event
        const e = new CustomEvent('advisorEvent', { detail: {
            budgetReport: true,
            taxes,
            upkeep,
            net: taxes - upkeep,
            funds: this.cityData.funds
        }});
        window.dispatchEvent(e);
    }

    private decayGrids() {
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                if (this.cityData.trafficGrid[y][x] > 0) {
                    this.cityData.trafficGrid[y][x] = Math.max(0, this.cityData.trafficGrid[y][x] - 2);
                }
                if (this.cityData.pollutionGrid[y][x] > 0) {
                    let decay = 1;
                    // Parks and trees naturally scrub a little extra pollution
                    const type = this.cityData.getTile(x, y);
                    if (type === TILE_TYPES.PARK || type === TILE_TYPES.TREE) decay = 3;

                    this.cityData.pollutionGrid[y][x] = Math.max(0, this.cityData.pollutionGrid[y][x] - decay);
                }
                if (this.cityData.crimeGrid[y][x] > 0) {
                     this.cityData.crimeGrid[y][x] = Math.max(0, this.cityData.crimeGrid[y][x] - 1);
                }
            }
        }
    }

    private calculateTerrainAuras() {
        // Reset base land value modifiers
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                this.cityData.landValueGrid[y][x] = 0;
            }
        }

        const radius = 3;
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                const type = this.cityData.getTile(x, y);
                if (type === TILE_TYPES.WATER || type === TILE_TYPES.PARK || type === TILE_TYPES.TREE) {
                    const boost = type === TILE_TYPES.WATER ? 5 : 3;
                    for (let dy = -radius; dy <= radius; dy++) {
                        for (let dx = -radius; dx <= radius; dx++) {
                            const nx = x + dx;
                            const ny = y + dy;
                            if (this.cityData.isValid(nx, ny)) {
                                this.cityData.landValueGrid[ny][nx] += boost;
                            }
                        }
                    }
                }
            }
        }
    }

    private calculateCityServices() {
        const policeRadius = 15;
        // Fire stations don't reduce crime, but they would prevent fires (omitted for MVP unless we add disasters)

        // Find police stations
        const stations: {x: number, y: number}[] = [];
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                if (this.cityData.getTile(x, y) === TILE_TYPES.POLICE_STATION) {
                    if (this.cityData.powerGrid[y][x]) { // Must be powered to work!
                         stations.push({x, y});
                    }
                }
            }
        }

        // Apply police aura (reduces crime heavily)
        for (const st of stations) {
            for (let dy = -policeRadius; dy <= policeRadius; dy++) {
                for (let dx = -policeRadius; dx <= policeRadius; dx++) {
                    const nx = st.x + dx;
                    const ny = st.y + dy;
                    if (this.cityData.isValid(nx, ny)) {
                        // The closer to the station, the stronger the crime reduction
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        if (dist <= policeRadius) {
                            const strength = Math.floor((policeRadius - dist) / 2);
                            this.cityData.crimeGrid[ny][nx] = Math.max(0, this.cityData.crimeGrid[ny][nx] - strength);
                        }
                    }
                }
            }
        }
    }

    private diffusePollution() {
        const newPollution: number[][] = [];
        for(let y=0; y<this.cityData.height; y++) {
            newPollution[y] = [];
            for(let x=0; x<this.cityData.width; x++) {
                newPollution[y][x] = this.cityData.pollutionGrid[y][x];
            }
        }

        // Simple convolution for diffusion
        for(let y=1; y<this.cityData.height-1; y++) {
            for(let x=1; x<this.cityData.width-1; x++) {
                const p = this.cityData.pollutionGrid[y][x];
                if (p > 5) {
                    const spread = Math.floor(p * 0.1);
                    newPollution[y-1][x] += spread;
                    newPollution[y+1][x] += spread;
                    newPollution[y][x-1] += spread;
                    newPollution[y][x+1] += spread;
                    newPollution[y][x] -= spread * 4;
                }
            }
        }

        this.cityData.pollutionGrid = newPollution;
    }

    private calculateCommute(startX: number, startY: number) {
        // BFS to find nearest Commercial or Industrial zone along roads/rails
        const MAX_DISTANCE = 40; // Limit search for performance (slightly higher for rails)
        const queue: {x: number, y: number, dist: number, path: {x:number, y:number}[]}[] = [];
        const visited = new Set<string>();

        // Find an adjacent transit tile to start the commute
        const neighbors = [{dx: 0, dy: -1}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: 1, dy: 0}];
        for(const n of neighbors) {
            const nx = startX + n.dx;
            const ny = startY + n.dy;
            if (this.cityData.isValid(nx, ny)) {
                const type = this.cityData.getTile(nx, ny);
                if (type === TILE_TYPES.ROAD_BASE || type === TILE_TYPES.RAIL_BASE) {
                    queue.push({x: nx, y: ny, dist: 0, path: [{x: nx, y: ny}]});
                    visited.add(`${nx},${ny}`);
                }
            }
        }

        let head = 0;
        let destinationFound = false;

        while (head < queue.length) {
            const current = queue[head++];

            if (current.dist > MAX_DISTANCE) break;

            // Check if adjacent to a destination (Commercial or Industrial)
            for(const n of neighbors) {
                const adjX = current.x + n.dx;
                const adjY = current.y + n.dy;
                if (this.cityData.isValid(adjX, adjY)) {
                    const type = this.cityData.getTile(adjX, adjY);
                    if ((type >= TILE_TYPES.COM_EMPTY && type <= TILE_TYPES.COM_HIGH && type !== TILE_TYPES.COM_EMPTY) ||
                        (type >= TILE_TYPES.IND_EMPTY && type <= TILE_TYPES.IND_HIGH && type !== TILE_TYPES.IND_EMPTY)) {
                        destinationFound = true;
                        // Apply traffic to path ONLY on roads
                        for (const step of current.path) {
                            if (this.cityData.getTile(step.x, step.y) === TILE_TYPES.ROAD_BASE) {
                                this.cityData.trafficGrid[step.y][step.x] += 5;
                                // High traffic generates pollution
                                if (this.cityData.trafficGrid[step.y][step.x] > 20) {
                                    this.cityData.pollutionGrid[step.y][step.x] += 2;
                                }
                            }
                        }
                        break;
                    }
                }
            }

            if (destinationFound) break;

            // Continue along transit
            for(const n of neighbors) {
                const nx = current.x + n.dx;
                const ny = current.y + n.dy;
                const key = `${nx},${ny}`;

                if (this.cityData.isValid(nx, ny) && !visited.has(key)) {
                    const type = this.cityData.getTile(nx, ny);
                    if (type === TILE_TYPES.ROAD_BASE || type === TILE_TYPES.RAIL_BASE) {
                        visited.add(key);
                        queue.push({
                            x: nx, y: ny,
                            dist: current.dist + 1,
                            path: [...current.path, {x: nx, y: ny}]
                        });
                    }
                }
            }
        }
    }

    private evaluateAdvisorEvents() {
        // We will dispatch events to the scene/ui
        let totalPollution = 0;
        let highTrafficTiles = 0;
        let roadTiles = 0;

        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                totalPollution += this.cityData.pollutionGrid[y][x];
                if (this.cityData.getTile(x, y) === TILE_TYPES.ROAD_BASE) {
                    roadTiles++;
                    if (this.cityData.trafficGrid[y][x] > 30) {
                        highTrafficTiles++;
                    }
                }
            }
        }

        // Tally total crime
        let totalCrime = 0;
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                totalCrime += this.cityData.crimeGrid[y][x];
            }
        }

        const e = new CustomEvent('advisorEvent', { detail: {
            totalPollution,
            highTrafficTiles,
            roadTiles,
            population: this.cityData.population,
            totalCrime
        }});
        window.dispatchEvent(e);
    }

    private updateRCI(r: number, c: number, i: number) {
        // Classic SimCity heuristic: Ratio of R:C:I should be roughly 3:1:1
        // If R is high but jobs (C/I) are low, demand for C/I goes up, R goes down.
        const total = r + c + i;

        // Tax rate modifier (7% is neutral. Higher tax = lower demand)
        const taxModifier = (0.07 - this.cityData.taxRate) * 10;

        if (total === 0) {
            this.cityData.demandR = this.clamp(0.8 + taxModifier, -1, 1);
            this.cityData.demandC = this.clamp(0.5 + taxModifier, -1, 1);
            this.cityData.demandI = this.clamp(0.5 + taxModifier, -1, 1);
            return;
        }

        const currentRatioR = r / total;
        const currentRatioC = c / total;
        const currentRatioI = i / total;

        const targetR = 0.50; // 50% Housing
        const targetC = 0.20; // 20% Commercial
        const targetI = 0.30; // 30% Industry

        this.cityData.demandR = this.clamp(((targetR - currentRatioR) * 2) + taxModifier, -1, 1);
        this.cityData.demandC = this.clamp(((targetC - currentRatioC) * 2) + taxModifier, -1, 1);
        this.cityData.demandI = this.clamp(((targetI - currentRatioI) * 2) + taxModifier, -1, 1);
        
        // Small baseline demand so city doesn't totally stall
        if (this.cityData.demandR < 0.1 && Math.random() < 0.3) this.cityData.demandR += 0.2;
    }
    
    private clamp(val: number, min: number, max: number) {
        return Math.max(min, Math.min(max, val));
    }

    private calculatePowerGrid() {
        // Reset power grid
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                this.cityData.powerGrid[y][x] = false;
            }
        }

        const queue: {x: number, y: number}[] = [];

        // Find power sources
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                if (this.cityData.getTile(x, y) === TILE_TYPES.POWER_PLANT) {
                    this.cityData.powerGrid[y][x] = true;
                    queue.push({x, y});
                }
            }
        }

        // BFS flood fill power
        const neighbors = [{dx: 0, dy: -1}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: 1, dy: 0}];
        let head = 0;
        
        // Use a head index instead of shift() which is O(N) in JS arrays and causes massive lag
        while(head < queue.length) {
            const current = queue[head++];
            
            for(const n of neighbors) {
                const nx = current.x + n.dx;
                const ny = current.y + n.dy;
                
                if (this.cityData.isValid(nx, ny) && !this.cityData.powerGrid[ny][nx]) {
                    const targetType = this.cityData.getTile(nx, ny);
                    // Power conducts through: Power Lines, Power Plants, and any Zone (Res/Com/Ind)
                    if (targetType === TILE_TYPES.POWER_LINE_BASE || targetType >= TILE_TYPES.RES_EMPTY) {
                        this.cityData.powerGrid[ny][nx] = true;
                        queue.push({x: nx, y: ny});
                    }
                }
            }
        }
    }

    private isAdjacentToTransit(x: number, y: number): boolean {
        // Check 4 directions for road or rail base
        const neighbors = [{dx: 0, dy: -1}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: 1, dy: 0}];

        for(const n of neighbors) {
            const type = this.cityData.getTile(x + n.dx, y + n.dy);
            if(type === TILE_TYPES.ROAD_BASE || type === TILE_TYPES.RAIL_BASE) {
                return true;
            }
        }
        return false;
    }
}
