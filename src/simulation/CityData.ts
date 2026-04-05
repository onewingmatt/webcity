export class CityData {
    public width: number;
    public height: number;
    public grid: number[][];

    // Simple mapping:
    // 0: Grass, 1: Road, 2: Res, 3: Com, 4: Ind, 5: Built-Res, 6: Built-Com, 7: Built-Ind
    
    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.grid = [];
        for (let y = 0; y < height; y++) {
            this.grid[y] = [];
            for (let x = 0; x < width; x++) {
                this.grid[y][x] = 0; // Default grass
            }
        }
    }

    setTile(x: number, y: number, type: number) {
        if (this.isValid(x, y)) {
            this.grid[y][x] = type;
        }
    }

    getTile(x: number, y: number): number {
        if (this.isValid(x, y)) {
            return this.grid[y][x];
        }
        return -1;
    }

    isValid(x: number, y: number) {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }
}
