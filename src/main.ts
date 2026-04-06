import Phaser from 'phaser';
import { GAME_CONFIG } from './core/Config';
import { BootScene } from './game/scenes/BootScene';
import { CityMap } from './game/scenes/CityMap';
import { MainUI } from './game/scenes/MainUI';
import { EvaluationUI } from './game/scenes/EvaluationUI';
import { NewspaperUI } from './game/scenes/NewspaperUI';

function initGame() {
    console.log('Initializing SimCity Web...');

    const config = {
        ...GAME_CONFIG,
        scene: [BootScene, CityMap, MainUI, EvaluationUI, NewspaperUI]
    };

    try {
        new Phaser.Game(config);
        console.log('Phaser game created successfully');
    } catch (error) {
        console.error('Failed to create Phaser game:', error);
    }
}

// Wait for DOM to be ready
if (document.readyState === 'complete') {
    initGame();
} else {
    window.addEventListener('load', initGame);
}
