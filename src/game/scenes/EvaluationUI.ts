import Phaser from 'phaser';

export class EvaluationUI extends Phaser.Scene {
    private container!: Phaser.GameObjects.Container;
    private graphGraphics!: Phaser.GameObjects.Graphics;
    private mode: '10' | '120' = '120'; // 10 years or 120 years

    constructor() {
        super({ key: 'EvaluationUI', active: true });
    }

    create() {
        this.container = this.add.container(0, 0);
        this.container.setVisible(false);
        this.container.setDepth(1000);

        // Dark background overlay
        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.8);
        bg.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);
        bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, this.cameras.main.width, this.cameras.main.height), Phaser.Geom.Rectangle.Contains);

        // Window border
        const windowWidth = 600;
        const windowHeight = 400;
        const startX = (this.cameras.main.width - windowWidth) / 2;
        const startY = (this.cameras.main.height - windowHeight) / 2;

        const win = this.add.graphics();
        win.fillStyle(0x000080, 1);
        win.fillRect(startX, startY, windowWidth, windowHeight);
        win.lineStyle(4, 0xffffff, 1);
        win.strokeRect(startX, startY, windowWidth, windowHeight);

        const title = this.add.text(this.cameras.main.width / 2, startY + 20, 'EVALUATION', {
            fontSize: '24px', color: '#fff', fontFamily: 'monospace'
        }).setOrigin(0.5);

        this.graphGraphics = this.add.graphics();

        // Close button
        const closeBtn = this.add.text(startX + windowWidth - 20, startY + 20, 'X', {
            fontSize: '20px', color: '#fff', fontFamily: 'monospace', backgroundColor: '#f00'
        }).setOrigin(0.5).setInteractive().on('pointerdown', () => this.hide());

        // Toggle time scale
        const toggleBtn = this.add.text(startX + 20, startY + windowHeight - 40, 'Toggle 10/120 Years', {
             fontSize: '16px', color: '#ff0', fontFamily: 'monospace'
        }).setInteractive().on('pointerdown', () => {
             this.mode = this.mode === '10' ? '120' : '10';
             this.drawGraph();
        });

        // Graph Legend
        const legendX = startX + windowWidth - 150;
        const legendY = startY + 80;
        this.add.text(legendX, legendY, 'City Pop', {color:'#0f0', fontSize:'14px', fontFamily:'monospace'});
        this.add.text(legendX, legendY + 20, 'Funds', {color:'#ff0', fontSize:'14px', fontFamily:'monospace'});
        this.add.text(legendX, legendY + 40, 'Crime', {color:'#f00', fontSize:'14px', fontFamily:'monospace'});
        this.add.text(legendX, legendY + 60, 'Pollution', {color:'#a52a2a', fontSize:'14px', fontFamily:'monospace'});

        this.container.add([bg, win, title, this.graphGraphics, closeBtn, toggleBtn,
            this.add.text(legendX, legendY, 'City Pop', {color:'#0f0', fontSize:'14px', fontFamily:'monospace'}),
            this.add.text(legendX, legendY + 20, 'Funds', {color:'#ff0', fontSize:'14px', fontFamily:'monospace'}),
            this.add.text(legendX, legendY + 40, 'Crime', {color:'#f00', fontSize:'14px', fontFamily:'monospace'}),
            this.add.text(legendX, legendY + 60, 'Pollution', {color:'#a52a2a', fontSize:'14px', fontFamily:'monospace'})
        ]);

        // Listen for open command
        const mainUi = this.scene.get('MainUI');
        if (mainUi) {
             mainUi.events.on('openEvaluation', () => this.show());
        }
    }

    show() {
        this.container.setVisible(true);
        // Pause simulation
        this.scene.get('CityMap').scene.pause();
        this.drawGraph();
    }

    hide() {
        this.container.setVisible(false);
        this.scene.get('CityMap').scene.resume();
    }

    drawGraph() {
        this.graphGraphics.clear();

        const cityScene = this.scene.get('CityMap') as any;
        if (!cityScene || !cityScene.cityData) return;

        let history = cityScene.cityData.history as any[];
        if (!history || history.length === 0) return;

        const limit = this.mode === '10' ? 10 : 120;
        const data = history.slice(-limit);
        if (data.length <= 1) return;

        const windowWidth = 600;
        const windowHeight = 400;
        const startX = (this.cameras.main.width - windowWidth) / 2 + 50;
        const startY = (this.cameras.main.height - windowHeight) / 2 + 80;

        const graphW = 350;
        const graphH = 200;

        // Draw axes
        this.graphGraphics.lineStyle(2, 0xffffff, 1);
        this.graphGraphics.beginPath();
        this.graphGraphics.moveTo(startX, startY);
        this.graphGraphics.lineTo(startX, startY + graphH);
        this.graphGraphics.lineTo(startX + graphW, startY + graphH);
        this.graphGraphics.stroke();

        // Find max values to scale
        let maxPop = 1, maxFunds = 1, maxCrime = 1, maxPol = 1;
        data.forEach(d => {
             if (d.pop > maxPop) maxPop = d.pop;
             if (d.funds > maxFunds) maxFunds = d.funds;
             if (d.crime > maxCrime) maxCrime = d.crime;
             if (d.pollution > maxPol) maxPol = d.pollution;
        });

        const dx = graphW / (limit - 1);

        const drawLine = (key: string, max: number, color: number) => {
            this.graphGraphics.lineStyle(2, color, 1);
            this.graphGraphics.beginPath();

            // If data points < limit, we pad to the right. Or we draw from left to right for the points we have.
            // Let's draw from right to left so latest is always at the right edge
            const startIdx = limit - data.length;

            data.forEach((d, i) => {
                const x = startX + (startIdx + i) * dx;
                const normalized = Math.min(1, d[key] / max);
                const y = startY + graphH - (normalized * graphH);
                if (i === 0) this.graphGraphics.moveTo(x, y);
                else this.graphGraphics.lineTo(x, y);
            });
            this.graphGraphics.stroke();
        };

        drawLine('pop', maxPop * 1.2, 0x00ff00);
        drawLine('funds', maxFunds * 1.2, 0xffff00);
        drawLine('crime', maxCrime * 1.2, 0xff0000);
        drawLine('pollution', maxPol * 1.2, 0xa52a2a);
    }
}
