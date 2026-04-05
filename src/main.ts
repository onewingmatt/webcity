import Phaser from 'phaser';
import { GAME_CONFIG } from './core/Config';
import { BootScene } from './game/scenes/BootScene';
import { CityMap } from './game/scenes/CityMap';
import { MainUI } from './game/scenes/MainUI';

const config = {
    ...GAME_CONFIG,
    scene: [BootScene, CityMap, MainUI]
};

new Phaser.Game(config);
