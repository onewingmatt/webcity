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

        let popCount = 0;
        let builtR = 0;
        let builtC = 0;
        let builtI = 0;

        // Growth and evaluation logic
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                const type = this.cityData.getTile(x, y);
                
                // Tally existing buildings
                if (type === TILE_TYPES.RES_BUILT) { popCount += 10; builtR++; }
                if (type === TILE_TYPES.COM_BUILT) { popCount += 10; builtC++; }
                if (type === TILE_TYPES.IND_BUILT) { builtI++; } // Industry doesn't directly add population

                // If it's an empty zone
                if (type === TILE_TYPES.RES_EMPTY || type === TILE_TYPES.COM_EMPTY || type === TILE_TYPES.IND_EMPTY) {
                    // Check if there is demand for this zone type
                    let hasDemand = false;
                    if (type === TILE_TYPES.RES_EMPTY && this.cityData.demandR > 0) hasDemand = true;
                    if (type === TILE_TYPES.COM_EMPTY && this.cityData.demandC > 0) hasDemand = true;
                    if (type === TILE_TYPES.IND_EMPTY && this.cityData.demandI > 0) hasDemand = true;

                    // Must be powered, adjacent to road, AND have demand to grow
                    if (this.cityData.powerGrid[y][x] && this.isAdjacentToRoad(x, y) && hasDemand) {
                        if (Math.random() < 0.1) { // 10% chance per month to grow if conditions met
                            // Upgrade the whole 3x3
                            let newType = TILE_TYPES.RES_BUILT;
                            if (type === TILE_TYPES.COM_EMPTY) newType = TILE_TYPES.COM_BUILT;
                            if (type === TILE_TYPES.IND_EMPTY) newType = TILE_TYPES.IND_BUILT;
                            
                            // Find root of 3x3
                            const frame = this.cityData.getFrame(x, y);
                            const offset = frame - type;
                            const dy = Math.floor(offset / 16);
                            const dx = offset % 16;
                            
                            let originX = x - dx;
                            let originY = y - dy;
                            
                            // Transform whole block
                            for (let cy = 0; cy < 3; cy++) {
                                for (let cx = 0; cx < 3; cx++) {
                                    if (this.cityData.isValid(originX+cx, originY+cy)) {
                                        this.cityData.typeGrid[originY+cy][originX+cx] = newType;
                                        this.cityData.frameGrid[originY+cy][originX+cx] = newType + (cy * 16) + cx;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Finalize Population (divided by 9 since a 3x3 block is 9 tiles, we counted each tile)
        this.cityData.population = Math.floor(popCount / 9);
        builtR = Math.floor(builtR / 9);
        builtC = Math.floor(builtC / 9);
        builtI = Math.floor(builtI / 9);
        
        this.updateRCI(builtR, builtC, builtI);
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
