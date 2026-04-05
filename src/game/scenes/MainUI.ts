import Phaser from 'phaser';

export class MainUI extends Phaser.Scene {
    public activeTool: number = 16; // Default to Road (16)
    private fundsText!: Phaser.GameObjects.Text;
    private dateText!: Phaser.GameObjects.Text;
    private popText!: Phaser.GameObjects.Text;
    
    private rciBars!: { r: Phaser.GameObjects.Graphics, c: Phaser.GameObjects.Graphics, i: Phaser.GameObjects.Graphics };
    private modeText!: Phaser.GameObjects.Text;

    // Advisor UI
    private advisorContainer!: Phaser.GameObjects.Container;
    private advisorText!: Phaser.GameObjects.Text;
    private messageQueue: string[] = [];
    private isMessageActive = false;

    constructor() {
        super({ key: 'MainUI', active: false });
    }

    create() {
        // Draw Top HUD background
        const hudHeight = 32;
        const hudBg = this.add.graphics();
        hudBg.fillStyle(0x000080, 1);
        hudBg.fillRect(0, 0, this.cameras.main.width, hudHeight);
        hudBg.lineStyle(4, 0xffffff, 1);
        hudBg.strokeRect(0, 0, this.cameras.main.width, hudHeight);

        // Draw Sidebar background (SNES blue border/menu background style)
        const sidebarWidth = 64;
        const bg = this.add.graphics();
        bg.fillStyle(0x000080, 1); // Dark blue background
        bg.fillRect(0, 0, sidebarWidth, this.cameras.main.height);
        bg.lineStyle(4, 0xffffff, 1); // White border
        bg.strokeRect(0, 0, sidebarWidth, this.cameras.main.height);

        // Expand tools to include Seaport, Airport.
        const tools = [
            { id: 0, frame: 0, key: '0', is3x3: false, label: 'Bulldoze' },
            { id: 16, frame: 1, key: '1', is3x3: false, label: 'Road' },
            { id: 240, frame: 1, key: '2', is3x3: false, label: 'Rail' },
            { id: 32, frame: 2, key: '3', is3x3: false, label: 'Power Line' },
            { id: 4, frame: 0, key: '4', is3x3: false, label: 'Park' },
            { id: 48, frame: 3, key: '5', is3x3: true, label: 'Residential' },
            { id: 60, frame: 4, key: '6', is3x3: true, label: 'Commercial' },
            { id: 105, frame: 5, key: '7', is3x3: true, label: 'Industrial' },
            { id: 153, frame: 4, key: '8', is3x3: true, label: 'Police' },
            { id: 156, frame: 5, key: '9', is3x3: true, label: 'Fire' },
            { id: 195, frame: 5, key: 'Q', is3x3: true, label: 'Seaport' },     // Using 'I' icon
            { id: 198, frame: 4, key: 'W', is3x3: true, label: 'Airport' },     // Using 'C' icon
            { id: 150, frame: 6, key: 'E', is3x3: true, label: 'Power Plant' },
            { id: 192, frame: 6, key: 'R', is3x3: true, label: 'Train Depot' },
        ];

        let startY = hudHeight + 5;

        // Setup HUD Text
        const textStyle = { fontSize: '16px', color: '#ffffff', fontFamily: 'monospace' };
        this.fundsText = this.add.text(80, 8, 'Funds: $20000', textStyle);
        this.dateText = this.add.text(280, 8, 'Jan 1900', textStyle);
        this.popText = this.add.text(460, 8, 'Pop: 0', textStyle);

        this.modeText = this.add.text(this.cameras.main.width - 220, 8, 'View: Normal (V)', textStyle);
        this.events.on('viewModeChanged', (mode: string) => {
            this.modeText.setText(`View: ${mode} (V)`);
        });

        // Setup RCI Meter
        this.setupRCIMeter();
        
        const toolIcons: { icon: Phaser.GameObjects.Image, border: Phaser.GameObjects.Graphics }[] = [];

        // We have 14 tools now, draw in two columns
        tools.forEach((tool, index) => {
            const col = index % 2;
            const row = Math.floor(index / 2);

            // Draw selection border (hidden initially)
            const border = this.add.graphics();
            border.lineStyle(2, 0xffff00, 1);
            const iconX = 2 + (col * 32);
            const iconY = startY + (row * 36);
            border.strokeRect(iconX - 2, iconY - 2, 30 + 4, 30 + 4);
            border.setVisible(false);

            // Add UI Icon
            const icon = this.add.image(iconX + 15, iconY + 15, 'ui_icons', tool.frame)
                .setInteractive()
                .setScale(0.8) // Scale down slightly to fit
                .on('pointerdown', () => this.setActiveTool(tool.id, toolIcons));
            
            // Tooltip text helper (draw over icon)
            this.add.text(iconX + 2, iconY + 2, tool.key, { fontSize: '10px', color: '#fff', backgroundColor: '#000' });
            
            toolIcons.push({ icon, border });
        });

        // Set initial active state
        this.setActiveTool(16, toolIcons);

        // Keyboard shortcuts for tools
        this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
            const keyChar = event.key.toUpperCase();
            const toolMap: Record<string, number> = {};
            tools.forEach(t => toolMap[t.key] = t.id);
            if (toolMap[keyChar] !== undefined) {
                this.setActiveTool(toolMap[keyChar], toolIcons);
            }
        });

        // Keyboard shortcuts for taxes
        this.input.keyboard?.on('keydown-MINUS', () => {
            const cityScene = this.scene.get('CityMap') as any;
            if (cityScene && cityScene.cityData) {
                cityScene.cityData.taxRate = Math.max(0, cityScene.cityData.taxRate - 0.01);
            }
        });
        this.input.keyboard?.on('keydown-EQUAL', () => { // Equal is typically the plus key
            const cityScene = this.scene.get('CityMap') as any;
            if (cityScene && cityScene.cityData) {
                cityScene.cityData.taxRate = Math.min(0.20, cityScene.cityData.taxRate + 0.01);
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

        // Setup Advisor UI
        this.setupAdvisorUI();

        // Listen for Advisor Events from Simulation
        const advisorListener = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            this.handleSimulationEvents(detail);
        };
        window.addEventListener('advisorEvent', advisorListener);

        this.events.on('shutdown', () => {
            window.removeEventListener('advisorEvent', advisorListener);
        });
    }

    setupAdvisorUI() {
        const boxWidth = 400;
        const boxHeight = 100;
        const x = this.cameras.main.width / 2 - boxWidth / 2;
        const y = this.cameras.main.height - boxHeight - 20;

        this.advisorContainer = this.add.container(x, y);
        this.advisorContainer.setDepth(100);
        this.advisorContainer.setVisible(false);

        const bg = this.add.graphics();
        bg.fillStyle(0x000080, 0.9);
        bg.fillRect(0, 0, boxWidth, boxHeight);
        bg.lineStyle(4, 0xffffff, 1);
        bg.strokeRect(0, 0, boxWidth, boxHeight);

        const portraitBg = this.add.graphics();
        portraitBg.fillStyle(0x000000, 1);
        portraitBg.fillRect(16, 18, 64, 64);
        portraitBg.lineStyle(2, 0xffffff, 1);
        portraitBg.strokeRect(16, 18, 64, 64);

        const portrait = this.add.image(48, 50, 'advisor');

        this.advisorText = this.add.text(96, 20, '', {
            fontSize: '16px',
            color: '#ffffff',
            fontFamily: 'monospace',
            wordWrap: { width: 280 }
        });

        const clickPrompt = this.add.text(boxWidth - 80, boxHeight - 25, 'Click >', {
            fontSize: '14px',
            color: '#ffff00',
            fontFamily: 'monospace'
        });
        // Blinking prompt
        this.tweens.add({
            targets: clickPrompt,
            alpha: 0,
            duration: 500,
            ease: 'Linear',
            yoyo: true,
            repeat: -1
        });

        // Click to dismiss/next
        bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, boxWidth, boxHeight), Phaser.Geom.Rectangle.Contains);
        bg.on('pointerdown', () => this.advanceMessage());

        this.advisorContainer.add([bg, portraitBg, portrait, this.advisorText, clickPrompt]);
    }

    handleSimulationEvents(stats: any) {
        const { totalPollution, highTrafficTiles, roadTiles, population, totalCrime, budgetReport, net, taxes, upkeep, disaster } = stats;

        if (disaster === 'FIRE') {
            this.queueMessage("FIRE! A fire has broken out in the city. Build Fire Stations to stop the spread, or bulldoze the area!");
            return;
        }

        if (budgetReport) {
            // Calculate a simple "Approval Rating" for the evaluation
            let approval = 50; // Base 50%
            if (net > 0) approval += 10;
            if (totalPollution > 100) approval -= 15;
            if (totalCrime > 50) approval -= 15;
            if (population > 500) approval += 20;
            approval = Math.max(0, Math.min(100, approval));

            this.queueMessage(`Year End Report! Approval Rating: ${approval}%. Collected $${taxes} in taxes. Paid $${upkeep} in road upkeep. Net change: $${net}. Use +/- to adjust tax rate.`);
            return;
        }

        // Thresholds for triggering messages
        if (population > 500 && Math.random() < 0.1) {
            this.queueMessage("Mayor, our city is growing! Keep up the good work zoning new areas.");
        }

        if (totalPollution > 100 && Math.random() < 0.2) {
            this.queueMessage("Warning! Pollution levels are rising. Citizens are complaining. Consider separating industry from residential zones.");
        }

        if (roadTiles > 20 && highTrafficTiles / roadTiles > 0.3 && Math.random() < 0.2) {
             this.queueMessage("Traffic is terrible! We need a better road network. Try adding more connections or alternative routes.");
        }

        if (totalCrime > 50 && Math.random() < 0.3) {
             this.queueMessage("Crime is out of control! Build more Police Stations (Press 7) to keep your citizens safe and maintain land value.");
        }
    }

    queueMessage(text: string) {
        // Prevent spamming the exact same message back to back
        if (this.messageQueue[this.messageQueue.length - 1] === text) return;

        this.messageQueue.push(text);
        if (!this.isMessageActive) {
            this.showNextMessage();
        }
    }

    showNextMessage() {
        if (this.messageQueue.length > 0) {
            this.isMessageActive = true;
            const msg = this.messageQueue[0];
            this.advisorText.setText(msg);
            this.advisorContainer.setVisible(true);
        } else {
            this.isMessageActive = false;
            this.advisorContainer.setVisible(false);
        }
    }

    advanceMessage() {
        if (this.isMessageActive) {
            this.messageQueue.shift();
            this.showNextMessage();
        }
    }

    setupRCIMeter() {
        const meterY = this.cameras.main.height - 120;
        const meterX = 4;
        
        // Background for RCI
        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 1);
        bg.fillRect(meterX, meterY, 56, 100);
        bg.lineStyle(2, 0xffffff, 1);
        bg.strokeRect(meterX, meterY, 56, 100);
        
        // Zero line
        bg.lineStyle(1, 0xffffff, 0.5);
        bg.beginPath();
        bg.moveTo(meterX + 2, meterY + 50);
        bg.lineTo(meterX + 54, meterY + 50);
        bg.stroke();

        this.add.text(meterX + 8, meterY + 104, 'R C I', { fontSize: '14px', color: '#fff', fontFamily: 'monospace' });
        
        this.rciBars = {
            r: this.add.graphics(),
            c: this.add.graphics(),
            i: this.add.graphics()
        };
    }

    update() {
        const cityScene = this.scene.get('CityMap') as any;
        if (cityScene && cityScene.cityData) {
            const data = cityScene.cityData;
            this.fundsText.setText(`Funds: $${data.funds}`);
            this.popText.setText(`Pop: ${data.population}`);
            
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const m = data.dateMonth - 1;
            const taxPct = Math.round(data.taxRate * 100);
            this.dateText.setText(`${months[m]} ${data.dateYear}  Tax: ${taxPct}%`);
            
            // Update RCI Meter (-1 to 1 mapped to -45 to 45 pixels)
            const meterY = this.cameras.main.height - 120;
            const meterX = 4;
            const zeroY = meterY + 50;
            const maxHeight = 45;

            const drawBar = (g: Phaser.GameObjects.Graphics, demand: number, color: number, offsetX: number) => {
                g.clear();
                g.fillStyle(color, 1);
                const h = Math.abs(demand) * maxHeight;
                if (demand >= 0) {
                    g.fillRect(meterX + offsetX, zeroY - h, 10, h);
                } else {
                    g.fillRect(meterX + offsetX, zeroY, 10, h);
                }
            };

            drawBar(this.rciBars.r, data.demandR, 0x4CAF50, 10);
            drawBar(this.rciBars.c, data.demandC, 0x2196F3, 24);
            drawBar(this.rciBars.i, data.demandI, 0xFFEB3B, 38);
        }
    }

    setActiveTool(toolId: number, icons: { icon: Phaser.GameObjects.Image, border: Phaser.GameObjects.Graphics }[]) {
        this.activeTool = toolId;
        
        // Let CityMap know if it's a 3x3 tool
        const toolMap = [0, 16, 240, 32, 4, 48, 60, 105, 153, 156, 195, 198, 150, 192];
        const is3x3 = toolId >= 48 && toolId !== 240 && toolId !== 224 && toolId !== 256;
        this.scene.get('CityMap').events.emit('toolChanged', is3x3);

        const activeIdx = toolMap.indexOf(toolId);
        
        icons.forEach((item, i) => {
            if (i === activeIdx) {
                item.border.setVisible(true);
            } else {
                item.border.setVisible(false);
            }
        });
    }
}
