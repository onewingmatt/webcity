import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        // Load the tileset we generated
        this.load.spritesheet('tiles', `${import.meta.env.BASE_URL}tileset_v2.png`, {
            frameWidth: 16,
            frameHeight: 16
        });

        // Load UI Icons
        this.load.spritesheet('ui_icons', `${import.meta.env.BASE_URL}ui_icons_v2.png`, {
            frameWidth: 32,
            frameHeight: 32
        });
    }

    create() {
        // Generate placeholder Advisor graphic
        const g = this.make.graphics({ x: 0, y: 0 }, false);
        g.fillStyle(0xd2b48c, 1); // Tan face
        g.fillRect(0, 0, 64, 64);
        g.fillStyle(0x000000, 1); // Eyes/hair
        g.fillRect(10, 10, 44, 10); // Hair
        g.fillRect(16, 26, 8, 8); // L eye
        g.fillRect(40, 26, 8, 8); // R eye
        g.fillStyle(0xffffff, 1); // glasses
        g.lineStyle(2, 0xffffff, 1);
        g.strokeRect(12, 22, 16, 16);
        g.strokeRect(36, 22, 16, 16);
        g.beginPath();
        g.moveTo(28, 30);
        g.lineTo(36, 30);
        g.stroke();
        g.fillStyle(0xff0000, 1); // mouth
        g.fillRect(24, 46, 16, 4);
        g.generateTexture('advisor', 64, 64);

        this.scene.start('CityMap');
        this.scene.launch('MainUI');
    }
}
