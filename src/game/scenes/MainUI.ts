import Phaser from 'phaser';

export class MainUI extends Phaser.Scene {
    public activeTool: number = 1; // Default to Road

    constructor() {
        super({ key: 'MainUI', active: false });
    }

    create() {
        // Draw Sidebar background (SNES blue border/menu background style)
        const sidebarWidth = 64;
        const bg = this.add.graphics();
        bg.fillStyle(0x000080, 1); // Dark blue background
        bg.fillRect(0, 0, sidebarWidth, this.cameras.main.height);
        bg.lineStyle(4, 0xffffff, 1); // White border
        bg.strokeRect(0, 0, sidebarWidth, this.cameras.main.height);

        const tools = [
            { id: 0, frame: 0, key: '0' },
            { id: 1, frame: 1, key: '1' },
            { id: 2, frame: 2, key: '2' },
            { id: 3, frame: 3, key: '3' },
            { id: 4, frame: 4, key: '4' }
        ];

        let startY = 40;
        const toolIcons: { icon: Phaser.GameObjects.Image, border: Phaser.GameObjects.Graphics }[] = [];

        tools.forEach((tool, index) => {
            // Draw selection border (hidden initially)
            const border = this.add.graphics();
            border.lineStyle(2, 0xffff00, 1);
            border.strokeRect(16 - 2, startY + (index * 40) - 2, 32 + 4, 32 + 4);
            border.setVisible(false);

            // Add UI Icon
            const icon = this.add.image(16 + 16, startY + (index * 40) + 16, 'ui_icons', tool.frame)
                .setInteractive()
                .on('pointerdown', () => this.setActiveTool(tool.id, toolIcons));
            
            // Tooltip text helper
            this.add.text(50, startY + (index * 40) + 8, tool.key, { fontSize: '14px', color: '#fff' });
            
            toolIcons.push({ icon, border });
        });

        // Set initial active state
        this.setActiveTool(1, toolIcons);

        // Keyboard shortcuts
        this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
            const key = parseInt(event.key);
            if (key >= 0 && key <= 4) {
                this.setActiveTool(key, toolIcons);
            }
        });

        // Controller bindings
        const cityScene = this.scene.get('CityMap');
        cityScene.events.on('nextTool', () => {
            let nextId = this.activeTool + 1;
            if (nextId > 4) nextId = 0;
            this.setActiveTool(nextId, toolIcons);
        });
        cityScene.events.on('prevTool', () => {
            let prevId = this.activeTool - 1;
            if (prevId < 0) prevId = 4;
            this.setActiveTool(prevId, toolIcons);
        });
    }

    setActiveTool(toolId: number, icons: { icon: Phaser.GameObjects.Image, border: Phaser.GameObjects.Graphics }[]) {
        this.activeTool = toolId;
        icons.forEach((item, i) => {
            if (i === toolId) {
                item.border.setVisible(true);
            } else {
                item.border.setVisible(false);
            }
        });
    }
}
