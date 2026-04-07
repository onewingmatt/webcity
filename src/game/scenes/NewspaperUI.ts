import Phaser from 'phaser';
import { audioManager } from '../AudioManager';

export class NewspaperUI extends Phaser.Scene {
    private container!: Phaser.GameObjects.Container;
    private headlineText!: Phaser.GameObjects.Text;
    private bodyText!: Phaser.GameObjects.Text;
    private dateText!: Phaser.GameObjects.Text;
    private isShown = false;
    private newspaperListener?: (event: Event) => void;

    constructor() {
        super({ key: 'NewspaperUI', active: true });
    }

    create() {
        this.container = this.add.container(0, 0);
        this.container.setVisible(false);
        this.container.setDepth(2000);

        // Dark background overlay
        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.9);
        bg.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);
        bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, this.cameras.main.width, this.cameras.main.height), Phaser.Geom.Rectangle.Contains);

        // Newspaper dimensions
        const paperWidth = 500;
        const paperHeight = 400;
        const startX = (this.cameras.main.width - paperWidth) / 2;
        const startY = (this.cameras.main.height - paperHeight) / 2;

        // Newspaper paper color (off-white/parchment)
        const paper = this.add.graphics();
        paper.fillStyle(0xf5f5dc, 1); // Beige/parchment color
        paper.fillRect(startX, startY, paperWidth, paperHeight);
        paper.lineStyle(4, 0x000000, 1);
        paper.strokeRect(startX, startY, paperWidth, paperHeight);

        // Border lines
        paper.lineStyle(2, 0x000000, 1);
        paper.strokeRect(startX + 10, startY + 10, paperWidth - 20, paperHeight - 20);

        // Header bar
        const headerBar = this.add.graphics();
        headerBar.fillStyle(0x000000, 1);
        headerBar.fillRect(startX + 20, startY + 40, paperWidth - 40, 40);

        // Title
        const title = this.add.text(this.cameras.main.width / 2, startY + 60, 'SIMCITY NEWS', {
            fontSize: '20px',
            color: '#fff',
            fontFamily: 'monospace',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Date
        this.dateText = this.add.text(this.cameras.main.width / 2, startY + 120, 'January 1900', {
            fontSize: '14px',
            color: '#000',
            fontFamily: 'monospace'
        }).setOrigin(0.5);

        // Headline
        this.headlineText = this.add.text(this.cameras.main.width / 2, startY + 160, '', {
            fontSize: '22px',
            color: '#000',
            fontFamily: 'monospace',
            fontStyle: 'bold',
            align: 'center',
            wordWrap: { width: paperWidth - 60 }
        }).setOrigin(0.5);

        // Body text
        this.bodyText = this.add.text(this.cameras.main.width / 2, startY + 240, '', {
            fontSize: '14px',
            color: '#000',
            fontFamily: 'monospace',
            align: 'center',
            wordWrap: { width: paperWidth - 60 }
        }).setOrigin(0.5);

        // Click anywhere to dismiss
        bg.on('pointerdown', () => this.hide());

        // Keyboard dismiss (Space or Enter)
        this.input.keyboard?.on('keydown-SPACE', () => this.hide());
        this.input.keyboard?.on('keydown-ENTER', () => this.hide());

        this.container.add([bg, paper, headerBar, title, this.dateText, this.headlineText, this.bodyText]);

        // Listen for newspaper events and clean up when the scene shuts down.
        this.newspaperListener = (event: Event) => this.handleNewspaperEvent(event as CustomEvent);
        window.addEventListener('newspaperEvent', this.newspaperListener);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    }

    private shutdown() {
        if (this.newspaperListener) {
            window.removeEventListener('newspaperEvent', this.newspaperListener);
            this.newspaperListener = undefined;
        }
    }

    private handleNewspaperEvent(event: CustomEvent) {
        const { headline, body, date } = event.detail;
        this.show(headline, body, date);
    }

    show(headline: string, body: string, date?: string) {
        this.headlineText.setText(headline);
        this.bodyText.setText(body);

        if (date) {
            this.dateText.setText(date);
        } else {
            const cityMap = this.scene.get('CityMap') as any;
            if (cityMap && cityMap.cityData) {
                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
                this.dateText.setText(`${monthNames[cityMap.cityData.dateMonth - 1]} ${cityMap.cityData.dateYear}`);
            }
        }

        this.container.setVisible(true);
        this.isShown = true;

        // Pause simulation
        this.scene.get('CityMap').scene.pause();
        this.scene.get('MainUI').scene.pause();

        audioManager.playClick();
    }

    hide() {
        if (!this.isShown) return;

        this.container.setVisible(false);
        this.isShown = false;

        // Resume simulation
        this.scene.get('CityMap').scene.resume();
        this.scene.get('MainUI').scene.resume();

        audioManager.playClick();
    }
}
