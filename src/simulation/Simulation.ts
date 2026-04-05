import { CityData, TILE_TYPES } from './CityData';

export class Simulation {
    private cityData: CityData;

    constructor(data: CityData) {
        this.cityData = data;
    }

    public tick() {
        this.calculatePowerGrid();

        // Growth logic
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                const type = this.cityData.getTile(x, y);
                
                // If it's an empty zone
                if (type === TILE_TYPES.RES_EMPTY || type === TILE_TYPES.COM_EMPTY || type === TILE_TYPES.IND_EMPTY) {
                    // Must be powered and adjacent to road to grow
                    if (this.cityData.powerGrid[y][x] && this.isAdjacentToRoad(x, y)) {
                        if (Math.random() < 0.05) { // 5% chance per tick
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
        
        while(queue.length > 0) {
            const current = queue.shift()!;
            
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
