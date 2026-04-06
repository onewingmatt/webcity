import Phaser from 'phaser';
import { GAME_CONFIG } from './core/Config';
import { BootScene } from './game/scenes/BootScene';
import { CityMap } from './game/scenes/CityMap';
import { MainUI } from './game/scenes/MainUI';
import { EvaluationUI } from './game/scenes/EvaluationUI';

const config = {
    ...GAME_CONFIG,
    scene: [BootScene, CityMap, MainUI, EvaluationUI]
};

new Phaser.Game(config);
