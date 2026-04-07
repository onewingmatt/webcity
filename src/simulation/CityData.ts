export const TILE_TYPES = {
    GRASS: 0,
    DIRT: 1,
    WATER: 2,
    TREE: 3,
    PARK: 4,
    FIRE: 5,

    ROAD_BASE: 16,
    POWER_LINE_BASE: 32,
    // 3x3 Zones - each block is 3 wide, taking up 3 horizontal tiles.
    // Tileset is 16 columns wide. Maximum 5 blocks per row (indices 0, 3, 6, 9, 12).

    // Row 3 (starts at 48)
    RES_EMPTY: 48,
    RES_LOW: 51,
    RES_MED: 54,
    RES_HIGH: 57,
    COM_EMPTY: 60,

    // Row 6 (starts at 96)
    COM_LOW: 96,
    COM_MED: 99,
    COM_HIGH: 102,
    IND_EMPTY: 105,
    IND_LOW: 108,

    // Row 9 (starts at 144)
    IND_MED: 144,
    IND_HIGH: 147,
    POWER_PLANT: 150,
    POLICE_STATION: 153,
    FIRE_STATION: 156,

    // Row 12 (starts at 192)
    TRAIN_DEPOT: 192,
    SEAPORT: 195,
    AIRPORT: 198,
    MAYOR_HOUSE: 201,
    CASINO: 204,
    AMUSEMENT_PARK: 207,

    // Note: 48 starts 3x3 zones. Let's put RAIL_BASE at the end of the tileset to avoid collisions,
    // since it needs a full 16 frames for auto-tiling.
    // Row 14 (starts at 224)
    BRIDGE_ROAD: 224,
    // Row 15 (starts at 240)
    RAIL_BASE: 240,
    // Row 16 (starts at 256)
    BRIDGE_RAIL: 256
};

export const TOOL_COSTS = {
    [TILE_TYPES.GRASS]: 1, // Bulldoze cost
    [TILE_TYPES.PARK]: 10,
    [TILE_TYPES.ROAD_BASE]: 10,
    [TILE_TYPES.RAIL_BASE]: 20,
    [TILE_TYPES.BRIDGE_ROAD]: 50,
    [TILE_TYPES.BRIDGE_RAIL]: 100,
    [TILE_TYPES.POWER_LINE_BASE]: 5,
    [TILE_TYPES.RES_EMPTY]: 100,
    [TILE_TYPES.COM_EMPTY]: 100,
    [TILE_TYPES.IND_EMPTY]: 100,
    [TILE_TYPES.POWER_PLANT]: 3000,
    [TILE_TYPES.POLICE_STATION]: 500,
    [TILE_TYPES.FIRE_STATION]: 500,
    [TILE_TYPES.TRAIN_DEPOT]: 500,
    [TILE_TYPES.SEAPORT]: 3000,
    [TILE_TYPES.AIRPORT]: 10000,
    [TILE_TYPES.MAYOR_HOUSE]: 0,
    [TILE_TYPES.CASINO]: 0,
    [TILE_TYPES.AMUSEMENT_PARK]: 0
};

const TILE_FRAME_BASES: Partial<Record<number, number>> = {
    [TILE_TYPES.POWER_PLANT]: 112,
    [TILE_TYPES.POLICE_STATION]: 113,
    [TILE_TYPES.FIRE_STATION]: 114,
    [TILE_TYPES.TRAIN_DEPOT]: 115,
    [TILE_TYPES.SEAPORT]: 116,
    [TILE_TYPES.AIRPORT]: 117,
    [TILE_TYPES.MAYOR_HOUSE]: 128,
    [TILE_TYPES.CASINO]: 129,
    [TILE_TYPES.AMUSEMENT_PARK]: 130
};

export class CityData {
    public width: number;
    public height: number;
    // We store the generic "type" of the tile to calculate connections.
    public typeGrid: number[][];
    // We store the actual visual frame index for Phaser.
    public frameGrid: number[][];
    // Which tiles have power
    public powerGrid: boolean[][];
    
    // Simulation Grids
    public trafficGrid: number[][];
    public pollutionGrid: number[][];
    public landValueGrid: number[][];
    public crimeGrid: number[][];

    // Economy and Stats
    public funds: number = 20000;
    public population: number = 0;
    public dateMonth: number = 1;
    public dateYear: number = 1900;
    
    // History (for Evaluation Graph)
    public history: { year: number, pop: number, funds: number, crime: number, pollution: number }[] = [];

    // Gifts
    public unlockedGifts: Set<number> = new Set();
    public placedGifts: Set<number> = new Set();

    // Budget
    public taxRate: number = 0.07; // 7% tax rate default
    public lastTaxesCollected: number = 0;
    public lastUpkeepPaid: number = 0;

    // RCI Demand (-1.0 to 1.0)
    public demandR: number = 1.0;
    public demandC: number = 0.2;
    public demandI: number = 0.8;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.typeGrid = [];
        this.frameGrid = [];
        this.powerGrid = [];
        this.trafficGrid = [];
        this.pollutionGrid = [];
        this.landValueGrid = [];
        this.crimeGrid = [];
        for (let y = 0; y < height; y++) {
            this.typeGrid[y] = [];
            this.frameGrid[y] = [];
            this.powerGrid[y] = [];
            this.trafficGrid[y] = [];
            this.pollutionGrid[y] = [];
            this.landValueGrid[y] = [];
            this.crimeGrid[y] = [];
            for (let x = 0; x < width; x++) {
                this.typeGrid[y][x] = TILE_TYPES.GRASS;
                this.frameGrid[y][x] = TILE_TYPES.GRASS;
                this.powerGrid[y][x] = false;
                this.trafficGrid[y][x] = 0;
                this.pollutionGrid[y][x] = 0;
                this.landValueGrid[y][x] = 0;
                this.crimeGrid[y][x] = 0;
            }
        }

        this.generateTerrain();
    }

    private generateTerrain() {
        // 1. Generate a wandering river
        let riverX = Math.floor(this.width / 2);
        for (let y = 0; y < this.height; y++) {
            // River is roughly 3 tiles wide
            for (let w = -1; w <= 1; w++) {
                const rx = riverX + w;
                if (this.isValid(rx, y)) {
                    this.typeGrid[y][rx] = TILE_TYPES.WATER;
                    this.frameGrid[y][rx] = TILE_TYPES.WATER;
                }
            }

            // Randomly drift left or right
            if (Math.random() < 0.3) riverX--;
            else if (Math.random() < 0.3) riverX++;

            riverX = Math.max(2, Math.min(this.width - 3, riverX));
        }

        // 2. Scatter trees using simple noise/random clumps
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (this.typeGrid[y][x] === TILE_TYPES.GRASS) {
                    if (Math.random() < 0.05) {
                        this.typeGrid[y][x] = TILE_TYPES.TREE;
                        this.frameGrid[y][x] = TILE_TYPES.TREE;

                        // Cluster trees
                        const neighbors = [{dx:-1,dy:0}, {dx:1,dy:0}, {dx:0,dy:-1}, {dx:0,dy:1}];
                        for (const n of neighbors) {
                            if (Math.random() < 0.5 && this.isValid(x+n.dx, y+n.dy) && this.typeGrid[y+n.dy][x+n.dx] === TILE_TYPES.GRASS) {
                                this.typeGrid[y+n.dy][x+n.dx] = TILE_TYPES.TREE;
                                this.frameGrid[y+n.dy][x+n.dx] = TILE_TYPES.TREE;
                            }
                        }
                    }
                }
            }
        }
    }

    setTile(x: number, y: number, type: number, triggerUpdate: boolean = true) {
        if (this.isValid(x, y)) {
            this.typeGrid[y][x] = type;
            // Default frame is the base type, will be overridden by auto-tile if road/power
            this.frameGrid[y][x] = type; 
            
            if (triggerUpdate) {
                this.updateTileAndNeighbors(x, y);
            }
        }
    }

    getTile(x: number, y: number): number {
        if (this.isValid(x, y)) {
            return this.typeGrid[y][x];
        }
        return -1;
    }
    
    getFrame(x: number, y: number): number {
        if (this.isValid(x, y)) {
            return this.frameGrid[y][x];
        }
        return -1;
    }

    getFrameBase(type: number): number {
        return TILE_FRAME_BASES[type] ?? type;
    }

    isValid(x: number, y: number) {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    updateTileAndNeighbors(x: number, y: number) {
        this.updateAutoTile(x, y);
        this.updateAutoTile(x, y - 1);
        this.updateAutoTile(x, y + 1);
        this.updateAutoTile(x - 1, y);
        this.updateAutoTile(x + 1, y);
    }

    private updateAutoTile(x: number, y: number) {
        if (!this.isValid(x, y)) return;
        
        const type = this.typeGrid[y][x];
        
        if (type === TILE_TYPES.ROAD_BASE || type === TILE_TYPES.POWER_LINE_BASE || type === TILE_TYPES.RAIL_BASE ||
            type === TILE_TYPES.BRIDGE_ROAD || type === TILE_TYPES.BRIDGE_RAIL) {
            let mask = 0;
            // North
            if (this.isConnectable(x, y - 1, type)) mask |= 1;
            // East
            if (this.isConnectable(x + 1, y, type)) mask |= 2;
            // South
            if (this.isConnectable(x, y + 1, type)) mask |= 4;
            // West
            if (this.isConnectable(x - 1, y, type)) mask |= 8;
            
            // For Rails crossing Roads, or Rails crossing Power lines, we'd need specific intersection frames.
            // For simplicity, we just use the mask on the base type.
            this.frameGrid[y][x] = type + mask;
        } else if (type >= TILE_TYPES.RES_EMPTY && type < TILE_TYPES.BRIDGE_ROAD) {
             // For 3x3 zones, the frame is set explicitly during placement, do nothing here.
        } else {
             this.frameGrid[y][x] = type;
        }
    }

    private isConnectable(x: number, y: number, targetType: number): boolean {
        if (!this.isValid(x, y)) return false;
        const type = this.typeGrid[y][x];
        
        if (type === targetType) return true;

        // Bridges connect to their respective transit types
        if (targetType === TILE_TYPES.ROAD_BASE && type === TILE_TYPES.BRIDGE_ROAD) return true;
        if (targetType === TILE_TYPES.BRIDGE_ROAD && type === TILE_TYPES.ROAD_BASE) return true;
        if (targetType === TILE_TYPES.RAIL_BASE && type === TILE_TYPES.BRIDGE_RAIL) return true;
        if (targetType === TILE_TYPES.BRIDGE_RAIL && type === TILE_TYPES.RAIL_BASE) return true;
        
        // Roads connect to power lines (for visual auto-tiling)
        if (targetType === TILE_TYPES.ROAD_BASE && type === TILE_TYPES.POWER_LINE_BASE) return true;
        
        // Power lines can connect to zones, power plants, and roads
        if (targetType === TILE_TYPES.POWER_LINE_BASE) {
            if (type >= TILE_TYPES.RES_EMPTY && type < TILE_TYPES.BRIDGE_ROAD) return true;
            if (type === TILE_TYPES.ROAD_BASE || type === TILE_TYPES.BRIDGE_ROAD) return true;
        }

        // Rails connect to Depots
        if (targetType === TILE_TYPES.RAIL_BASE || targetType === TILE_TYPES.BRIDGE_RAIL) {
            if (type === TILE_TYPES.TRAIN_DEPOT) return true;
        }
        
        return false;
    }
}
