import Phaser from 'phaser';
import { CityData } from '../../simulation/CityData';
import { MainUI } from './MainUI';
import { Simulation } from '../../simulation/Simulation';
import { InputManager } from '../../core/InputManager';

import { TILE_TYPES } from '../../simulation/CityData';
import { audioManager } from '../AudioManager';

export class CityMap extends Phaser.Scene {
    private mapWidth = 50;
    private mapHeight = 50;
    private tileSize = 16;
    private is3x3Mode = false;
    
    public showPollutionLayer = false;

    private cityData!: CityData;
    private simulation!: Simulation;
    private layer!: Phaser.Tilemaps.TilemapLayer;
    private marker!: Phaser.GameObjects.Graphics;
    private inputManager!: InputManager;
    
    constructor() {
        super('CityMap');
    }

    create() {
        this.cityData = new CityData(this.mapWidth, this.mapHeight);
        this.simulation = new Simulation(this.cityData);
        this.inputManager = new InputManager(this);

        // Create blank tilemap
        const map = this.make.tilemap({
            tileWidth: this.tileSize,
            tileHeight: this.tileSize,
            width: this.mapWidth,
            height: this.mapHeight
        });

        const tileset = map.addTilesetImage('tiles', 'tiles', this.tileSize, this.tileSize, 0, 0);
        if(!tileset) throw new Error("Tileset not found");

        this.layer = map.createBlankLayer('CityLayer', tileset, 0, 0)!;
        this.layer.fill(0); // Fill with grass (index 0)

        // Setup camera
        this.cameras.main.setBounds(0, 0, this.mapWidth * this.tileSize, this.mapHeight * this.tileSize);
        this.cameras.main.setZoom(2);
        this.cameras.main.centerOn(this.mapWidth * this.tileSize / 2, this.mapHeight * this.tileSize / 2);

        // Hover Marker
        this.marker = this.add.graphics();
        this.updateMarkerSize();
        
        this.events.on('toolChanged', (is3x3: boolean) => {
            this.is3x3Mode = is3x3;
            this.updateMarkerSize();
        });

        // Handle camera panning
        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (pointer.isDown && pointer.button === 2) { // Right click to pan
                this.cameras.main.scrollX -= (pointer.x - pointer.prevPosition.x) / this.cameras.main.zoom;
                this.cameras.main.scrollY -= (pointer.y - pointer.prevPosition.y) / this.cameras.main.zoom;
            }
        });
        
        // Prevent context menu
        this.input.mouse?.disableContextMenu();

        // Setup Pollution Toggle
        this.input.keyboard?.on('keydown-V', () => {
            this.showPollutionLayer = !this.showPollutionLayer;
            this.scene.get('MainUI').events.emit('viewModeChanged', this.showPollutionLayer ? 'Pollution' : 'Normal');
            this.tickSimulation(); // Force redraw
        });

        // Setup simulation timer
        this.time.addEvent({
            delay: 1000,
            callback: this.tickSimulation,
            callbackScope: this,
            loop: true
        });
    }

    updateMarkerSize() {
        this.marker.clear();
        this.marker.lineStyle(2, 0xffffff, 1);
        const size = this.is3x3Mode ? this.tileSize * 3 : this.tileSize;
        this.marker.strokeRect(0, 0, size, size);
    }

    update(time: number) {
        this.inputManager.update(time, this.mapWidth, this.mapHeight);

        let pointerTileX = this.inputManager.cursorX;
        let pointerTileY = this.inputManager.cursorY;
        let actionTriggered = this.inputManager.actionPressed;

        // Override with mouse/touch if pointer is active (mouse moved or touch started)
        if (this.input.activePointer.active) {
             const worldPoint = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
             const pX = this.layer.worldToTileX(worldPoint.x);
             const pY = this.layer.worldToTileY(worldPoint.y);
             if (pX !== null && pY !== null) {
                 pointerTileX = pX;
                 pointerTileY = pY;
                 // Update internal cursor to match mouse so controller takes over smoothly
                 this.inputManager.cursorX = pX;
                 this.inputManager.cursorY = pY;
             }
        }

        // Action trigger: Left click or main touch
        // Prevent painting if we are panning with multiple pointers
        const pointer2Down = this.input.pointer2 ? this.input.pointer2.isDown : false;
        if (this.input.activePointer.isDown && this.input.activePointer.button === 0 && !pointer2Down) {
            actionTriggered = true;
        }

        if (pointerTileX >= 0 && pointerTileX < this.mapWidth && 
            pointerTileY >= 0 && pointerTileY < this.mapHeight) {
            
            // Snap marker to grid. If 3x3, align top-left
            if (this.is3x3Mode) {
                // Ensure we don't go off edge
                pointerTileX = Math.min(pointerTileX, this.mapWidth - 3);
                pointerTileY = Math.min(pointerTileY, this.mapHeight - 3);
            }
            this.marker.setPosition(pointerTileX * this.tileSize, pointerTileY * this.tileSize);
            
            // Camera follow cursor if offscreen (for gamepad)
            const cursorPixelX = pointerTileX * this.tileSize;
            const cursorPixelY = pointerTileY * this.tileSize;
            const camView = this.cameras.main.worldView;
            
            if (cursorPixelX < camView.x + 32) this.cameras.main.scrollX -= 2;
            if (cursorPixelX > camView.right - 32) this.cameras.main.scrollX += 2;
            if (cursorPixelY < camView.y + 32) this.cameras.main.scrollY -= 2;
            if (cursorPixelY > camView.bottom - 32) this.cameras.main.scrollY += 2;

            if (actionTriggered) {
                this.placeTile(pointerTileX, pointerTileY);
            }
        }
    }

    placeTile(x: number, y: number) {
        const uiScene = this.scene.get('MainUI') as MainUI;
        if (!uiScene) return;

        const currentTool = uiScene.activeTool;
        
        // Prevent placing gifts if not unlocked or already placed
        if (currentTool >= TILE_TYPES.MAYOR_HOUSE) {
            if (!this.cityData.unlockedGifts.has(currentTool)) return;
            if (this.cityData.placedGifts.has(currentTool)) return; // Only allow 1 of each gift
        }

        // Check funds (Importing TOOL_COSTS inline here for safety, it's exported from CityData)
        const cost = this.getToolCost(currentTool);
        if (this.cityData.funds < cost) {
            // Flash funds UI or just return
            return;
        }

        let placed = false;

        if (currentTool === TILE_TYPES.GRASS) {
            // Bulldozer
            const targetType = this.cityData.getTile(x, y);
            const isTarget3x3 = targetType >= TILE_TYPES.RES_EMPTY && targetType < TILE_TYPES.BRIDGE_ROAD;

            if (isTarget3x3) {
                // Find top-left of the 3x3
                let originX = x;
                let originY = y;
                // Since our 3x3 frames are laid out in a grid, we need to find the root.
                const frame = this.cityData.getFrame(x, y);
                const offset = frame - targetType;
                const dy = Math.floor(offset / 16);
                const dx = offset % 16;
                
                originX = x - dx;
                originY = y - dy;

                for (let cy = 0; cy < 3; cy++) {
                    for (let cx = 0; cx < 3; cx++) {
                        this.cityData.setTile(originX + cx, originY + cy, TILE_TYPES.GRASS, true);
                    }
                }
                placed = true;
            } else {
                // Standard 1x1 Bulldozer
                if (targetType !== TILE_TYPES.GRASS) {
                     this.cityData.setTile(x, y, TILE_TYPES.GRASS, true);
                     placed = true;
                }
            }
        } else if (this.is3x3Mode) {
            // Place 3x3 Zone
            // 1. Collision check
            let canPlace = true;
            for (let cy = 0; cy < 3; cy++) {
                for (let cx = 0; cx < 3; cx++) {
                    if (this.cityData.getTile(x + cx, y + cy) !== TILE_TYPES.GRASS) {
                        canPlace = false;
                    }
                }
            }
            
            if (canPlace) {
                for (let cy = 0; cy < 3; cy++) {
                    for (let cx = 0; cx < 3; cx++) {
                        // The frame index in the atlas is Base + (cy * 16) + cx
                        const frameId = currentTool + (cy * 16) + cx;
                        this.cityData.setTile(x + cx, y + cy, currentTool, false);
                        this.cityData.frameGrid[y + cy][x + cx] = frameId;
                    }
                }
                // Update edges for any adjacent roads/power lines
                for (let cy = -1; cy <= 3; cy++) {
                    for (let cx = -1; cx <= 3; cx++) {
                        this.cityData.updateTileAndNeighbors(x + cx, y + cy);
                    }
                }
                placed = true;
            }
        } else {
            // Place 1x1 Road, Rail, Power, or Park
            const targetType = this.cityData.getTile(x, y);

            // Handle Bridging
            if (targetType === TILE_TYPES.WATER) {
                if (currentTool === TILE_TYPES.ROAD_BASE) {
                    if (this.cityData.funds >= this.getToolCost(TILE_TYPES.BRIDGE_ROAD)) {
                        this.cityData.setTile(x, y, TILE_TYPES.BRIDGE_ROAD, true);
                        this.cityData.funds -= this.getToolCost(TILE_TYPES.BRIDGE_ROAD);
                        audioManager.playBuild();
                        // We handled cost manually since bridging dynamically swaps the tool
                        return;
                    }
                } else if (currentTool === TILE_TYPES.RAIL_BASE) {
                    if (this.cityData.funds >= this.getToolCost(TILE_TYPES.BRIDGE_RAIL)) {
                        this.cityData.setTile(x, y, TILE_TYPES.BRIDGE_RAIL, true);
                        this.cityData.funds -= this.getToolCost(TILE_TYPES.BRIDGE_RAIL);
                        audioManager.playBuild();
                        return;
                    }
                }
            }
            // Allow placing on grass, dirt, or tree (which gets bulldozed implicitly)
            else if (targetType === TILE_TYPES.GRASS || targetType === TILE_TYPES.DIRT || targetType === TILE_TYPES.TREE) {
                if (targetType !== currentTool) {
                    this.cityData.setTile(x, y, currentTool, true);
                    placed = true;
                }
            }
        }

        if (placed) {
            if (currentTool >= TILE_TYPES.MAYOR_HOUSE) {
                this.cityData.placedGifts.add(currentTool);
            }
            this.cityData.funds -= cost;
            if (currentTool === TILE_TYPES.GRASS) {
                audioManager.playBulldoze();
            } else {
                audioManager.playBuild();
            }
        }
    }

    private getToolCost(tool: number): number {
        switch(tool) {
            case TILE_TYPES.GRASS: return 1;
            case TILE_TYPES.PARK: return 10;
            case TILE_TYPES.ROAD_BASE: return 10;
            case TILE_TYPES.RAIL_BASE: return 20;
            case TILE_TYPES.BRIDGE_ROAD: return 50;
            case TILE_TYPES.BRIDGE_RAIL: return 100;
            case TILE_TYPES.POWER_LINE_BASE: return 5;
            case TILE_TYPES.RES_EMPTY: return 100;
            case TILE_TYPES.COM_EMPTY: return 100;
            case TILE_TYPES.IND_EMPTY: return 100;
            case TILE_TYPES.POWER_PLANT: return 3000;
            case TILE_TYPES.POLICE_STATION: return 500;
            case TILE_TYPES.FIRE_STATION: return 500;
            case TILE_TYPES.TRAIN_DEPOT: return 500;
            case TILE_TYPES.SEAPORT: return 3000;
            case TILE_TYPES.AIRPORT: return 10000;
            default: return 0;
        }
    }

    tickSimulation() {
        this.simulation.tick();
        // Sync map with city data frames
        for(let y=0; y<this.mapHeight; y++) {
            for(let x=0; x<this.mapWidth; x++) {
                const frame = this.cityData.getFrame(x, y);
                let tile = this.layer.getTileAt(x, y);
                
                if(tile && tile.index !== frame) {
                    tile = this.layer.putTileAt(frame, x, y);
                }
                
                // Visual indicators
                if (tile) {
                    const type = this.cityData.getTile(x, y);

                    if (this.showPollutionLayer) {
                        // Pollution overlay mode
                        const pollution = this.cityData.pollutionGrid[y][x];
                        if (pollution > 20) {
                            tile.tint = 0xff0000; // Heavy pollution
                        } else if (pollution > 5) {
                            tile.tint = 0xffff00; // Medium pollution
                        } else {
                            tile.tint = 0xffffff;
                        }
                    } else {
                        // Normal play mode
                        const hasPower = this.cityData.powerGrid[y][x];
                        const is3x3 = type >= TILE_TYPES.RES_EMPTY && type < TILE_TYPES.RAIL_BASE;
                        const needsPower = is3x3;

                        // Check traffic on roads/bridges
                        if (type === TILE_TYPES.ROAD_BASE || type === TILE_TYPES.BRIDGE_ROAD) {
                            const traffic = this.cityData.trafficGrid[y][x];
                            if (traffic > 20) {
                                tile.tint = 0x666666; // Heavy traffic darkens road
                            } else if (traffic > 5) {
                                tile.tint = 0xaaaaaa; // Light traffic
                            } else {
                                tile.tint = 0xffffff;
                            }
                        } else if (type === TILE_TYPES.WATER) {
                            tile.tint = 0x88ccff; // Slight blue tint for water if the tileset is greyscale
                        } else if (type === TILE_TYPES.TREE) {
                            tile.tint = 0x228b22; // Forest green tint
                        } else if (type === TILE_TYPES.PARK) {
                            tile.tint = 0x32cd32; // Lime green tint
                        } else if (needsPower && !hasPower) {
                            tile.tint = 0x888888; // Darken if unpowered
                        } else {
                            tile.tint = 0xffffff;
                        }
                    }
                }
            }
        }
    }
}
