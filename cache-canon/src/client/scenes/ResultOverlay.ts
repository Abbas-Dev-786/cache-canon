import { Scene } from 'phaser';
import * as Phaser from 'phaser';

export class ResultOverlay extends Scene {
  private resultData: any;

  constructor() {
    super('ResultOverlay');
  }

  init(data: { result: any }) {
    this.resultData = data.result;
  }

  create() {
    const reducedMotion = this.registry.get('prefersReducedMotion');
    const alreadyCompleted = this.resultData.alreadyCompleted;

    if (alreadyCompleted) {
      this.time.delayedCall(100, () => {
        this.game.events.emit('show-result', this.resultData);
      });
      return;
    }

    // 1. Board-wide confetti/spark burst
    this.spawnConfetti(reducedMotion);

    // 2. Slow motion effect (if client doesn't prefer reduced motion)
    if (!reducedMotion) {
      this.time.timeScale = 0.25;
      this.time.delayedCall(400, () => {
        this.time.timeScale = 1;
      });
    }

    // 3. Emit show-result to trigger the DOM overlay
    this.time.delayedCall(reducedMotion ? 100 : 500, () => {
      this.game.events.emit('show-result', this.resultData);
    });
  }

  private spawnConfetti(reducedMotion: boolean) {
    const colors = [0xff0055, 0x00ff88, 0x44ddff, 0xffd700];
    const particleCount = reducedMotion ? 10 : 60;

    for (let i = 0; i < particleCount; i++) {
      const x = Phaser.Math.Between(40, 350);
      const y = Phaser.Math.Between(100, 440);
      const color = Phaser.Math.RND.pick(colors);

      const particles = this.add.particles(x, y, 'particle', {
        lifespan: 1200,
        speed: { min: 40, max: 100 },
        scale: { start: 2.0, end: 0 },
        rotate: { start: 0, end: 360 },
        alpha: { start: 1, end: 0 },
        blendMode: 'ADD',
        tint: color,
        maxParticles: reducedMotion ? 3 : 15
      });

      this.time.delayedCall(1500, () => particles.destroy());
    }
  }
}
