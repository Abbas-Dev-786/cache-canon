import { Scene } from 'phaser';

export class Boot extends Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.load.image('bg', 'assets/bg.png');
    this.load.image('cannon', 'assets/cannon.png');
    this.load.image('tile_unfired', 'assets/tile_unfired.png');
    this.load.image('tile_miss', 'assets/tile_miss.png');
    this.load.image('tile_hit', 'assets/tile_hit.png');
    this.load.image('shell', 'assets/shell.png');

    this.load.audio('fire', 'assets/audio/fire.mp3');
    this.load.audio('hit', 'assets/audio/hit.mp3');
    this.load.audio('miss', 'assets/audio/miss.mp3');
    this.load.audio('victory', 'assets/audio/victory.mp3');
  }

  create() {



    // Particle texture: 4x4 white square
    const gPart = this.make.graphics({ x: 0, y: 0 }, false);
    gPart.fillStyle(0xffffff, 1);
    gPart.fillRect(0, 0, 4, 4);
    gPart.generateTexture('particle', 4, 4);

    this.scene.start('HuntScene');
  }
}
