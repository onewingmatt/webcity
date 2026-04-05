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
        }

        this.calculatePowerGrid();

        // Decay traffic and pollution slightly every tick
        this.decayGrids();

        let popCount = 0;
        let builtR = 0;
        let builtC = 0;
        let builtI = 0;

        // Growth and evaluation logic
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                const type = this.cityData.getTile(x, y);
                
                // Calculate local land value (simplified)
                // High pollution drastically reduces land value.
                const pollution = this.cityData.pollutionGrid[y][x];
                let landValue = 50 - pollution;
                this.cityData.landValueGrid[y][x] = landValue;

                const isIndustry = type >= TILE_TYPES.IND_EMPTY && type <= TILE_TYPES.IND_HIGH;
                const isResidential = type >= TILE_TYPES.RES_EMPTY && type <= TILE_TYPES.RES_HIGH;
                const isCommercial = type >= TILE_TYPES.COM_EMPTY && type <= TILE_TYPES.COM_HIGH;

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
                        const hasRoad = this.isAdjacentToRoad(x, y) || this.isAdjacentToRoad(x+1, y) || this.isAdjacentToRoad(x+2, y) ||
                                        this.isAdjacentToRoad(x, y+1) || this.isAdjacentToRoad(x+2, y+1) ||
                                        this.isAdjacentToRoad(x, y+2) || this.isAdjacentToRoad(x+1, y+2) || this.isAdjacentToRoad(x+2, y+2);

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

    private decayGrids() {
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                if (this.cityData.trafficGrid[y][x] > 0) {
                    this.cityData.trafficGrid[y][x] = Math.max(0, this.cityData.trafficGrid[y][x] - 2);
                }
                if (this.cityData.pollutionGrid[y][x] > 0) {
                    this.cityData.pollutionGrid[y][x] = Math.max(0, this.cityData.pollutionGrid[y][x] - 1);
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
        // BFS to find nearest Commercial or Industrial zone along roads
        const MAX_DISTANCE = 30; // Limit search for performance
        const queue: {x: number, y: number, dist: number, path: {x:number, y:number}[]}[] = [];
        const visited = new Set<string>();

        // Find an adjacent road to start the commute
        const neighbors = [{dx: 0, dy: -1}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: 1, dy: 0}];
        for(const n of neighbors) {
            const nx = startX + n.dx;
            const ny = startY + n.dy;
            if (this.cityData.isValid(nx, ny) && this.cityData.getTile(nx, ny) === TILE_TYPES.ROAD_BASE) {
                queue.push({x: nx, y: ny, dist: 0, path: [{x: nx, y: ny}]});
                visited.add(`${nx},${ny}`);
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
                        // Apply traffic to path
                        for (const step of current.path) {
                            this.cityData.trafficGrid[step.y][step.x] += 5;
                            // High traffic generates pollution
                            if (this.cityData.trafficGrid[step.y][step.x] > 20) {
                                this.cityData.pollutionGrid[step.y][step.x] += 2;
                            }
                        }
                        break;
                    }
                }
            }

            if (destinationFound) break;

            // Continue along roads
            for(const n of neighbors) {
                const nx = current.x + n.dx;
                const ny = current.y + n.dy;
                const key = `${nx},${ny}`;

                if (this.cityData.isValid(nx, ny) && !visited.has(key)) {
                    if (this.cityData.getTile(nx, ny) === TILE_TYPES.ROAD_BASE) {
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

        const e = new CustomEvent('advisorEvent', { detail: {
            totalPollution,
            highTrafficTiles,
            roadTiles,
            population: this.cityData.population
        }});
        window.dispatchEvent(e);
    }

    private updateRCI(r: number, c: number, i: number) {
        // Classic SimCity heuristic: Ratio of R:C:I should be roughly 3:1:1
        // If R is high but jobs (C/I) are low, demand for C/I goes up, R goes down.
        const total = r + c + i;
        if (total === 0) {
            this.cityData.demandR = 0.8;
            this.cityData.demandC = 0.5;
            this.cityData.demandI = 0.5;
            return;
        }

        const currentRatioR = r / total;
        const currentRatioC = c / total;
        const currentRatioI = i / total;

        const targetR = 0.50; // 50% Housing
        const targetC = 0.20; // 20% Commercial
        const targetI = 0.30; // 30% Industry

        this.cityData.demandR = this.clamp((targetR - currentRatioR) * 2, -1, 1);
        this.cityData.demandC = this.clamp((targetC - currentRatioC) * 2, -1, 1);
        this.cityData.demandI = this.clamp((targetI - currentRatioI) * 2, -1, 1);
        
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

    private isAdjacentToRoad(x: number, y: number): boolean {
        // Check 4 directions for road base
        const neighbors = [{dx: 0, dy: -1}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: 1, dy: 0}];

        for(const n of neighbors) {
            if(this.cityData.getTile(x + n.dx, y + n.dy) === TILE_TYPES.ROAD_BASE) {
                return true;
            }
        }
        return false;
    }
}
