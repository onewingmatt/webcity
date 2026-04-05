import Phaser from 'phaser';

export class InputManager {
    private scene: Phaser.Scene;
    public cursorX: number = 0;
    public cursorY: number = 0;
    public actionPressed: boolean = false;
    private gamepad: Phaser.Input.Gamepad.Gamepad | null = null;
    private lastGamepadMove: number = 0;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        
        // Listen for gamepads
        this.scene.input.gamepad?.on('connected', (pad: Phaser.Input.Gamepad.Gamepad) => {
            this.gamepad = pad;
            console.log('Gamepad connected!');
        });
    }

    update(time: number, mapWidth: number, mapHeight: number) {
        this.actionPressed = false;

        // Keyboard directional updates (WASD / Arrows)
        const keys = this.scene.input.keyboard?.createCursorKeys();
        const wasd = this.scene.input.keyboard?.addKeys('W,A,S,D') as any;

        let keyMoved = false;
        if (time > this.lastGamepadMove + 150) {
            if (keys?.left.isDown || wasd?.A.isDown) {
                this.cursorX = Math.max(0, this.cursorX - 1);
                keyMoved = true;
            } else if (keys?.right.isDown || wasd?.D.isDown) {
                this.cursorX = Math.min(mapWidth - 1, this.cursorX + 1);
                keyMoved = true;
            }

            if (keys?.up.isDown || wasd?.W.isDown) {
                this.cursorY = Math.max(0, this.cursorY - 1);
                keyMoved = true;
            } else if (keys?.down.isDown || wasd?.S.isDown) {
                this.cursorY = Math.min(mapHeight - 1, this.cursorY + 1);
                keyMoved = true;
            }
            if (keys?.space.isDown) {
                this.actionPressed = true;
            }
            
            if (keyMoved) {
                this.lastGamepadMove = time;
            }
        }

        // Mouse / Touch updates handled directly in CityMap by pointer position
        
        // Gamepad updates
        if (this.gamepad && time > this.lastGamepadMove + 150) {
            let moved = false;
            
            if (this.gamepad.left || this.gamepad.axes[0].getValue() < -0.5) {
                this.cursorX = Math.max(0, this.cursorX - 1);
                moved = true;
            } else if (this.gamepad.right || this.gamepad.axes[0].getValue() > 0.5) {
                this.cursorX = Math.min(mapWidth - 1, this.cursorX + 1);
                moved = true;
            }

            if (this.gamepad.up || this.gamepad.axes[1].getValue() < -0.5) {
                this.cursorY = Math.max(0, this.cursorY - 1);
                moved = true;
            } else if (this.gamepad.down || this.gamepad.axes[1].getValue() > 0.5) {
                this.cursorY = Math.min(mapHeight - 1, this.cursorY + 1);
                moved = true;
            }

            if (moved) {
                this.lastGamepadMove = time;
            }

            if (this.gamepad.A) {
                this.actionPressed = true;
            }
            
            // Cycle tools with bumpers
            if (this.gamepad.L1 && time > this.lastGamepadMove + 200) {
                // Should emit event to UI
                this.scene.events.emit('prevTool');
                this.lastGamepadMove = time;
            }
            if (this.gamepad.R1 && time > this.lastGamepadMove + 200) {
                this.scene.events.emit('nextTool');
                this.lastGamepadMove = time;
            }
        }
    }
}
