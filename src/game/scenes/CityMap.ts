import Phaser from 'phaser';
import { CityData } from '../../simulation/CityData';
import { MainUI } from './MainUI';
import { Simulation } from '../../simulation/Simulation';
import { InputManager } from '../../core/InputManager';

export class CityMap extends Phaser.Scene {
    private mapWidth = 50;
    private mapHeight = 50;
    private tileSize = 16;
    
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
        this.marker.lineStyle(2, 0xffffff, 1);
        this.marker.strokeRect(0, 0, this.tileSize, this.tileSize);

        // Handle camera panning
        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (pointer.isDown && pointer.button === 2) { // Right click to pan
                this.cameras.main.scrollX -= (pointer.x - pointer.prevPosition.x) / this.cameras.main.zoom;
                this.cameras.main.scrollY -= (pointer.y - pointer.prevPosition.y) / this.cameras.main.zoom;
            }
        });
        
        // Prevent context menu
        this.input.mouse?.disableContextMenu();

        // Setup simulation timer
        this.time.addEvent({
            delay: 1000,
            callback: this.tickSimulation,
            callbackScope: this,
            loop: true
        });
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
        if (this.input.activePointer.isDown && this.input.activePointer.button === 0 && this.input.pointer2.isDown === false) {
            actionTriggered = true;
        }

        if (pointerTileX >= 0 && pointerTileX < this.mapWidth && 
            pointerTileY >= 0 && pointerTileY < this.mapHeight) {
            
            // Snap marker to grid
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
        
        // Prevent placing if it's already the same type to save performance/avoid loops
        if (this.cityData.getTile(x, y) !== currentTool) {
            this.cityData.setTile(x, y, currentTool);
            this.layer.putTileAt(currentTool, x, y);
        }
    }

    tickSimulation() {
        this.simulation.tick();
        // Sync map with city data
        for(let y=0; y<this.mapHeight; y++) {
            for(let x=0; x<this.mapWidth; x++) {
                const type = this.cityData.getTile(x, y);
                const currentTile = this.layer.getTileAt(x, y);
                if(currentTile && currentTile.index !== type) {
                    this.layer.putTileAt(type, x, y);
                }
            }
        }
    }
}
