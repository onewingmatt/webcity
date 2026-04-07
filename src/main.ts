import Phaser from 'phaser';
import { GAME_CONFIG } from './core/Config';
import { BootScene } from './game/scenes/BootScene';
import { CityMap } from './game/scenes/CityMap';
import { MainUI } from './game/scenes/MainUI';
import { EvaluationUI } from './game/scenes/EvaluationUI';
import { NewspaperUI } from './game/scenes/NewspaperUI';

const loadingEl = document.getElementById('loading');

function showError(message: string) {
    if (loadingEl) {
        loadingEl.textContent = 'Error: ' + message;
        loadingEl.style.color = 'red';
    }
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:10px;left:10px;padding:10px;background:red;color:white;z-index:9999;font-family:sans-serif;font-size:14px;';
    div.textContent = message;
    document.body.appendChild(div);
}

function showStatus(message: string) {
    if (loadingEl) {
        loadingEl.textContent = message;
    }
}

function hideLoading() {
    if (loadingEl) loadingEl.remove();
}

function initGame() {
    showStatus('Starting game...');

    const config = {
        ...GAME_CONFIG,
        scene: [BootScene, CityMap, MainUI, EvaluationUI, NewspaperUI]
    };

    try {
        new Phaser.Game(config);
        console.log('Phaser game created successfully');
        hideLoading();
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        showError('Phaser error: ' + errorMsg);
        console.error('Failed to create Phaser game:', error);
    }
}

if (typeof Phaser === 'undefined') {
    showError('Phaser not loaded');
} else {
    initGame();
}
