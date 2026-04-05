import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        // Load the tileset we generated
        this.load.spritesheet('tiles', '/tileset_v2.png', {
            frameWidth: 16,
            frameHeight: 16
        });
        
        // Load UI Icons
        this.load.spritesheet('ui_icons', '/ui_icons_v2.png', {
            frameWidth: 32,
            frameHeight: 32
        });
    }

    create() {
        this.scene.start('CityMap');
        this.scene.launch('MainUI');
    }
}
