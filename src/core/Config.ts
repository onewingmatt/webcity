import Phaser from 'phaser';

export const GAME_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.CANVAS,
  width: 800,
  height: 600,
  parent: document.body,
  pixelArt: true,
  backgroundColor: '#1a1a2e',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 800,
    height: 600,
    min: {
      width: 400,
      height: 300
    }
  },
  input: {
    gamepad: true
  },
  scene: [],
  callbacks: {
    preBoot: () => {
      console.log('Phaser preBoot callback');
    },
    postBoot: () => {
      console.log('Phaser postBoot callback');
    }
  }
};
