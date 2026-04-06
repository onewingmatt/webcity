import Phaser from 'phaser';
import { GAME_CONFIG } from './core/Config';
import { BootScene } from './game/scenes/BootScene';
import { CityMap } from './game/scenes/CityMap';
import { MainUI } from './game/scenes/MainUI';
import { EvaluationUI } from './game/scenes/EvaluationUI';
import { NewspaperUI } from './game/scenes/NewspaperUI';

const config = {
    ...GAME_CONFIG,
    scene: [BootScene, CityMap, MainUI, EvaluationUI, NewspaperUI]
};

new Phaser.Game(config);
