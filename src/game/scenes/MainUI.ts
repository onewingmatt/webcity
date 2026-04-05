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
            { id: 0, frame: 0, key: '0', is3x3: false }, // Bulldozer
            { id: 16, frame: 1, key: '1', is3x3: false }, // Road
            { id: 32, frame: 2, key: '2', is3x3: false }, // Power Line
            { id: 48, frame: 3, key: '3', is3x3: true }, // Res
            { id: 54, frame: 4, key: '4', is3x3: true }, // Com
            { id: 60, frame: 5, key: '5', is3x3: true }, // Ind
            { id: 99, frame: 6, key: '6', is3x3: true }, // Power Plant
        ];

        let startY = 10;
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
            if (key >= 0 && key <= 6) {
                const map = [0, 16, 32, 48, 54, 60, 99];
                this.setActiveTool(map[key], toolIcons);
            }
        });

        // Controller bindings
        const cityScene = this.scene.get('CityMap');
        
        const getNextToolId = () => {
             const idx = tools.findIndex(t => t.id === this.activeTool);
             const nextIdx = (idx + 1) % tools.length;
             return tools[nextIdx].id;
        }
        
        const getPrevToolId = () => {
             const idx = tools.findIndex(t => t.id === this.activeTool);
             const prevIdx = (idx - 1 + tools.length) % tools.length;
             return tools[prevIdx].id;
        }

        cityScene.events.on('nextTool', () => {
            this.setActiveTool(getNextToolId(), toolIcons);
        });
        cityScene.events.on('prevTool', () => {
            this.setActiveTool(getPrevToolId(), toolIcons);
        });
    }

    setActiveTool(toolId: number, icons: { icon: Phaser.GameObjects.Image, border: Phaser.GameObjects.Graphics }[]) {
        this.activeTool = toolId;
        
        // Let CityMap know if it's a 3x3 tool
        const toolData = [0, 16, 32, 48, 54, 60, 99].find(id => id === toolId);
        const is3x3 = toolData !== undefined && toolData >= 48;
        this.scene.get('CityMap').events.emit('toolChanged', is3x3);

        const tools = [0, 16, 32, 48, 54, 60, 99];
        const activeIdx = tools.indexOf(toolId);
        
        icons.forEach((item, i) => {
            if (i === activeIdx) {
                item.border.setVisible(true);
            } else {
                item.border.setVisible(false);
            }
        });
    }
}
