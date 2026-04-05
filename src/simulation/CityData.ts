export const TILE_TYPES = {
    GRASS: 0,
    DIRT: 1,
    ROAD_BASE: 16,
    POWER_LINE_BASE: 32,
    RES_EMPTY: 48, // 3x3 starts here (ROW 3)
    RES_BUILT: 51,
    COM_EMPTY: 54,
    COM_BUILT: 57,
    IND_EMPTY: 60,
    IND_BUILT: 96, // ROW 6
    POWER_PLANT: 99
};

export const TOOL_COSTS = {
    [TILE_TYPES.GRASS]: 1, // Bulldoze cost
    [TILE_TYPES.ROAD_BASE]: 10,
    [TILE_TYPES.POWER_LINE_BASE]: 5,
    [TILE_TYPES.RES_EMPTY]: 100,
    [TILE_TYPES.COM_EMPTY]: 100,
    [TILE_TYPES.IND_EMPTY]: 100,
    [TILE_TYPES.POWER_PLANT]: 3000
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

    // Economy and Stats
    public funds: number = 20000;
    public population: number = 0;
    public dateMonth: number = 1;
    public dateYear: number = 1900;
    
    // RCI Demand (-1.0 to 1.0)
    public demandR: number = 0.5;
    public demandC: number = 0.5;
    public demandI: number = 0.5;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.typeGrid = [];
        this.frameGrid = [];
        this.powerGrid = [];
        this.trafficGrid = [];
        this.pollutionGrid = [];
        this.landValueGrid = [];
        for (let y = 0; y < height; y++) {
            this.typeGrid[y] = [];
            this.frameGrid[y] = [];
            this.powerGrid[y] = [];
            this.trafficGrid[y] = [];
            this.pollutionGrid[y] = [];
            this.landValueGrid[y] = [];
            for (let x = 0; x < width; x++) {
                this.typeGrid[y][x] = TILE_TYPES.GRASS;
                this.frameGrid[y][x] = TILE_TYPES.GRASS;
                this.powerGrid[y][x] = false;
                this.trafficGrid[y][x] = 0;
                this.pollutionGrid[y][x] = 0;
                this.landValueGrid[y][x] = 0;
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
        
        if (type === TILE_TYPES.ROAD_BASE || type === TILE_TYPES.POWER_LINE_BASE) {
            let mask = 0;
            // North
            if (this.isConnectable(x, y - 1, type)) mask |= 1;
            // East
            if (this.isConnectable(x + 1, y, type)) mask |= 2;
            // South
            if (this.isConnectable(x, y + 1, type)) mask |= 4;
            // West
            if (this.isConnectable(x - 1, y, type)) mask |= 8;
            
            this.frameGrid[y][x] = type + mask;
        } else if (type >= TILE_TYPES.RES_EMPTY) {
             // For 3x3 zones, the frame is set explicitly during placement, do nothing here.
        } else {
             this.frameGrid[y][x] = type;
        }
    }

    private isConnectable(x: number, y: number, targetType: number): boolean {
        if (!this.isValid(x, y)) return false;
        const type = this.typeGrid[y][x];
        
        if (type === targetType) return true;
        
        // Power lines can connect to zones and power plants
        if (targetType === TILE_TYPES.POWER_LINE_BASE) {
            if (type >= TILE_TYPES.RES_EMPTY) return true; // Connects to any zone/building
        }
        
        return false;
    }
}
