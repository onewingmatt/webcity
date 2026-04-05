import { CityData } from './CityData';

export class Simulation {
    private cityData: CityData;

    constructor(data: CityData) {
        this.cityData = data;
    }

    public tick() {
        // Growth logic
        // If a zone (2,3,4) is next to a road (1), it has a small chance to build up (5,6,7)
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                const type = this.cityData.getTile(x, y);
                if (type >= 2 && type <= 4) {
                    if (this.isAdjacentToRoad(x, y) && Math.random() < 0.1) {
                        this.cityData.setTile(x, y, type + 3); // 2->5, 3->6, 4->7
                    }
                }
            }
        }
    }

    private isAdjacentToRoad(x: number, y: number): boolean {
        // Check 4 directions
        const neighbors = [
            {dx: 0, dy: -1},
            {dx: 0, dy: 1},
            {dx: -1, dy: 0},
            {dx: 1, dy: 0}
        ];

        for(const n of neighbors) {
            if(this.cityData.getTile(x + n.dx, y + n.dy) === 1) { // 1 is Road
                return true;
            }
        }
        return false;
    }
}
