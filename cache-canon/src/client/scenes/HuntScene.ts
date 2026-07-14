import { Scene } from 'phaser';
import * as Phaser from 'phaser';
import { BOARD } from '../../shared/constants';
import type { ClueData, HuntView, ShotResult } from '../../shared/types';

export class HuntScene extends Scene {
  private tiles: Phaser.GameObjects.Image[] = [];
  private tileStates: ('unfired' | 'miss' | 'hit')[] = Array(BOARD.TOTAL).fill('unfired');
  private foundCaches: number[] = [];
  
  private cannon!: Phaser.GameObjects.Image;
  private reticle!: Phaser.GameObjects.Graphics;
  
  private shots = 0;
  private misses = 0;
  
  private isFiring = false;
  private huntId: string | null = null;
  private targetRotation = 0;
  private isLoggedInUser = true;

  constructor() {
    super('HuntScene');
  }

  init(data?: { huntId?: string }) {
    this.huntId = data?.huntId || null;
  }

  async create() {
    this.add.image(0, 0, 'bg').setOrigin(0, 0).setDisplaySize(390, 600).setDepth(-1);
    
    this.shots = 0;
    this.misses = 0;
    this.foundCaches = [];
    this.tileStates = Array(BOARD.TOTAL).fill('unfired');
    this.isFiring = true; // Disable input while loading grid state

    this.buildGrid();
    this.buildCannon();
    this.setupInput();
    
    // Initial UI state reset
    this.game.events.emit('shot-resolved', {
      shots: this.shots,
      misses: this.misses,
      foundCount: this.foundCaches.length,
      firedCells: [],
      completed: false,
    });

    // Load initial board state from server
    try {
      const url = this.huntId ? `/api/hunt-view?postId=${this.huntId}` : '/api/hunt-view';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const view = await res.json() as HuntView;
      this.isLoggedInUser = view.isLoggedIn !== false;
      this.game.events.emit('hunt-loaded', view.postId);

      // Recover state
      this.shots = view.run.shots;
      this.misses = view.run.misses;
      this.foundCaches = [...view.run.foundCells];

      // Update tiles based on what has been fired
      view.run.firedCells.forEach(cellIdx => {
        const isHit = view.run.foundCells.includes(cellIdx);
        const tile = this.tiles[cellIdx];
        if (isHit) {
          this.tileStates[cellIdx] = 'hit';
          if (tile) tile.setTexture('tile_hit');
        } else {
          this.tileStates[cellIdx] = 'miss';
          if (tile) tile.setTexture('tile_miss');
        }
      });

      this.game.events.emit('shot-resolved', {
        shots: this.shots,
        misses: this.misses,
        foundCount: this.foundCaches.length,
        firedCells: view.run.firedCells,
        completed: view.run.completed,
      });

      // If already completed, directly start victory transition
      if (view.run.completed) {
        this.scene.start('ResultOverlay', {
          result: {
            cellIndex: view.run.firedCells[view.run.firedCells.length - 1] ?? 0,
            outcome: 'hit',
            run: view.run,
            completed: true,
            alreadyCompleted: true,
          }
        });
      } else {
        this.isFiring = false; // Enable inputs
      }
    } catch (e) {
      console.error('Failed to load board configuration:', e);
      this.isFiring = false;
    }
  }

  private cellToXY(index: number): { x: number; y: number } {
    const col = index % BOARD.COLS;
    const row = Math.floor(index / BOARD.COLS);
    
    const tileW = 40;
    const gap = 4;
    const step = tileW + gap;
    const gridW = BOARD.COLS * step - gap;
    const originX = (390 - gridW) / 2 + tileW / 2;
    const originY = 120 + tileW / 2;
    
    return {
      x: originX + col * step,
      y: originY + row * step
    };
  }

  private buildGrid() {
    this.tiles = [];
    for (let i = 0; i < BOARD.TOTAL; i++) {
      const { x, y } = this.cellToXY(i);
      const img = this.add.image(x, y, 'tile_unfired').setInteractive({ useHandCursor: true });
      img.setDisplaySize(40, 40);
      img.setData('index', i);
      this.tiles.push(img);
    }

    // Grid labels
    const tileW = 40;
    const gap = 4;
    const step = tileW + gap;
    const gridW = BOARD.COLS * step - gap;
    const originX = (390 - gridW) / 2;
    const originY = 120;

    // A-F column labels at the top
    for (let col = 0; col < BOARD.COLS; col++) {
      this.add.text(originX + col * step + tileW / 2, originY - 20, String.fromCharCode(65 + col), {
        fontFamily: '"Playfair Display", Georgia, serif', fontSize: '18px', color: '#1a3e62', fontStyle: 'bold'
      }).setOrigin(0.5);
    }

    // 1-8 row labels on the left
    for (let row = 0; row < BOARD.ROWS; row++) {
      this.add.text(originX - 20, originY + row * step + tileW / 2, (row + 1).toString(), {
        fontFamily: '"Playfair Display", Georgia, serif', fontSize: '18px', color: '#1a3e62', fontStyle: 'bold'
      }).setOrigin(0.5);
    }

    // Reticle
    this.reticle = this.add.graphics();
    this.reticle.lineStyle(2, 0xff0055, 1);
    this.reticle.strokeRect(-20, -20, 40, 40);
    this.reticle.setVisible(false);
  }

  private buildCannon() {
    const cannonX = 390 / 2;
    const cannonY = 520;

    // Barrel
    this.cannon = this.add.image(cannonX, cannonY, 'cannon');
    this.cannon.setDisplaySize(80, 80);
    this.cannon.setOrigin(0.5, 0.6); // Rotate around pivot
  }

  private setupInput() {
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.isFiring) return;
      
      const targetIndex = this.pointerToCell(p.x, p.y);
      if (targetIndex !== null && this.tileStates[targetIndex] === 'unfired') {
        const { x, y } = this.cellToXY(targetIndex);
        this.reticle.setPosition(x, y).setVisible(true);
        this.rotateCannon(x, y);
      } else {
        this.reticle.setVisible(false);
      }
    });

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.isFiring) return;

      const targetIndex = this.pointerToCell(p.x, p.y);
      if (targetIndex !== null) {
        if (this.tileStates[targetIndex] === 'unfired') {
          this.fire(targetIndex);
        } else {
          this.playDryFire();
        }
      }
    });
  }

  private pointerToCell(x: number, y: number): number | null {
    const tileW = 40;
    const gap = 4;
    const step = tileW + gap;
    const gridW = BOARD.COLS * step - gap;
    const gridH = BOARD.ROWS * step - gap;
    const originX = (390 - gridW) / 2;
    const originY = 120;

    if (x < originX || x > originX + gridW || y < originY || y > originY + gridH) {
      return null;
    }

    const col = Math.floor((x - originX) / step);
    const row = Math.floor((y - originY) / step);
    
    if (col >= BOARD.COLS || row >= BOARD.ROWS) return null;

    return row * BOARD.COLS + col;
  }

  private rotateCannon(targetX: number, targetY: number) {
    const angle = Phaser.Math.Angle.Between(this.cannon.x, this.cannon.y, targetX, targetY);
    this.targetRotation = angle + Math.PI / 2;
  }

  override update(_time: number, delta: number) {
    this.cannon.rotation = Phaser.Math.Angle.RotateTo(this.cannon.rotation, this.targetRotation, 0.01 * delta);
  }

  private fire(cellIndex: number) {
    if (!this.isLoggedInUser) {
      this.game.events.emit('prompt-login');
      return;
    }
    this.isFiring = true;
    this.reticle.setVisible(false);

    const tile = this.tiles[cellIndex];
    if (tile) {
      tile.setTint(0xd4af37); // Pirate's Booty Gold
      this.tweens.add({
        targets: tile,
        alpha: 0.5,
        yoyo: true,
        repeat: -1,
        duration: 200
      });
    }

    const shotPromise = this.fetchShotResult(cellIndex);

    this.playSafeSound('fire', { volume: 0.5 });

    const { x, y } = this.cellToXY(cellIndex);
    
    // Cannon Recoil Animation
    const angle = Phaser.Math.Angle.Between(this.cannon.x, this.cannon.y, x, y);
    const recoilDist = 12;
    const startX = this.cannon.x;
    const startY = this.cannon.y;
    this.tweens.add({
      targets: this.cannon,
      x: startX - Math.cos(angle) * recoilDist,
      y: startY - Math.sin(angle) * recoilDist,
      duration: 50,
      yoyo: true,
      ease: 'Power2'
    });

    const shell = this.add.image(this.cannon.x, this.cannon.y, 'shell');
    shell.setDisplaySize(16, 16);

    // Shell trail emitter
    const trail = this.add.particles(0, 0, 'particle', {
      lifespan: 150,
      scale: { start: 1, end: 0 },
      alpha: { start: 0.6, end: 0 },
      tint: 0x444444,
      frequency: 20,
      follow: shell
    });

    // Cannon Recoil
    const originalY = this.cannon.y;
    this.tweens.add({
      targets: this.cannon,
      y: originalY + 8,
      duration: 80,
      yoyo: true,
      ease: 'Quad.easeOut'
    });

    // Shell parabola flight
    this.tweens.add({
      targets: shell,
      x, y,
      duration: 450,
      ease: 'Quad.easeIn',
      onUpdate: (tween) => {
        const progress = tween.progress;
        shell.y = Phaser.Math.Linear(originalY, y, progress) - Math.sin(progress * Math.PI) * 90;
      },
      onComplete: async () => {
        shell.destroy();
        trail.destroy();
        try {
          const data = await shotPromise;
          this.processShotResult(cellIndex, data);
        } catch (error) {
          console.error('Failed to resolve shot:', error);
          if (tile) {
            this.tweens.killTweensOf(tile);
            tile.clearTint();
            tile.setAlpha(1);
          }
          this.cameras.main.shake(150, 0.003);
          this.isFiring = false;
        }
      }
    });
  }

  private async fetchShotResult(cellIndex: number, retries = 2): Promise<ShotResult> {
    const requestId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const body = JSON.stringify({
      cellIndex,
      postId: this.huntId || undefined,
      requestId
    });

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch('/api/fire-at-cell', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json() as ShotResult;
      } catch (e) {
        if (attempt === retries) throw e;
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    throw new Error('Failed to resolve shot after retries');
  }

  private processShotResult(cellIndex: number, data: ShotResult) {
    if (data.duplicate) {
      this.playDryFire();
      this.isFiring = false;
      return;
    }
    this.shots = data.run.shots;
    this.misses = data.run.misses;

    const tile = this.tiles[cellIndex];
    if (tile) {
      this.tweens.killTweensOf(tile);
      tile.clearTint();
      tile.setAlpha(1);
    }

    if (data.outcome === 'hit') {
      this.tileStates[cellIndex] = 'hit';
      if (tile) { tile.setTexture('tile_hit'); tile.setDisplaySize(40, 40); }
      this.foundCaches.push(cellIndex);
      this.showHitEffect(cellIndex);
    } else {
      this.tileStates[cellIndex] = 'miss';
      if (tile) { tile.setTexture('tile_miss'); tile.setDisplaySize(40, 40); }
      this.showMissEffect(cellIndex);
      
      if (data.clue) {
        this.showClueAnimation(cellIndex, data.clue);
        this.game.events.emit('show-clue', data.clue);
      }
    }

    const publicRun = {
      shots: data.run.shots,
      misses: data.run.misses,
      foundCount: data.run.foundCount,
      firedCells: data.run.firedCells,
      completed: data.run.completed,
    };

    this.game.events.emit('shot-resolved', publicRun);

    if (data.completed) {
      this.playSafeSound('victory', { volume: 0.8 });
      const reducedMotion = this.registry.get('prefersReducedMotion');
      
      if (!reducedMotion) {
        this.time.timeScale = 0.2; // slow motion
      }
      
      this.time.delayedCall(reducedMotion ? 150 : 600, () => {
        this.time.timeScale = 1.0;
        
        // Spawn confetti from found caches
        this.foundCaches.forEach(cellIdx => {
          const { x: cx, y: cy } = this.cellToXY(cellIdx);
          this.createExplosion(cx, cy, 0xd4af37, reducedMotion ? 5 : 30); // Pirate's Booty Gold
          this.createExplosion(cx, cy, 0x00a65f, reducedMotion ? 5 : 30); // Emerald Green
        });

        this.time.delayedCall(300, () => {
          this.scene.start('ResultOverlay', {
            result: data
          });
        });
      });
    } else {
      this.isFiring = false;
    }
  }

  private showHitEffect(cellIndex: number) {
    this.playSafeSound('hit', { volume: 0.6 });

    const { x, y } = this.cellToXY(cellIndex);
    const tile = this.tiles[cellIndex];
    
    if (tile) {
      tile.setDisplaySize(20, 20);
      this.tweens.add({
        targets: tile,
        displayWidth: 40,
        displayHeight: 40,
        duration: 300,
        ease: 'Back.easeOut'
      });
    }

    const reducedMotion = this.registry.get('prefersReducedMotion');
    this.createExplosion(x, y, 0x00a65f, reducedMotion ? 5 : 25); // Emerald Green
    if (!reducedMotion) {
      this.cameras.main.shake(200, 0.008);
    }
  }

  private showMissEffect(cellIndex: number) {
    this.playSafeSound('miss', { volume: 0.4 });

    const { x, y } = this.cellToXY(cellIndex);
    const reducedMotion = this.registry.get('prefersReducedMotion');
    this.createExplosion(x, y, 0x00c8d9, reducedMotion ? 2 : 8); // Abyssal Turquoise
    if (!reducedMotion) {
      this.cameras.main.shake(100, 0.002);
    }
  }

  private createExplosion(x: number, y: number, color: number, count: number) {
    const particles = this.add.particles(x, y, 'particle', {
      lifespan: 600,
      speed: { min: 50, max: 120 },
      scale: { start: 1.5, end: 0 },
      rotate: { start: 0, end: 360 },
      alpha: { start: 1, end: 0 },
      blendMode: 'ADD',
      tint: color,
      maxParticles: count
    });
    this.time.delayedCall(800, () => particles.destroy());
  }

  private showClueAnimation(cellIndex: number, clue: ClueData) {
    const { x, y } = this.cellToXY(cellIndex);
    
    const ringConfigs: Record<ClueData['signal'], { color: number, duration: number, maxScale: number }> = {
      strong:  { color: 0x00a65f, duration: 600,  maxScale: 1.5 }, // Emerald Green
      near:    { color: 0x00c8d9, duration: 900,  maxScale: 2.0 }, // Abyssal Turquoise
      weak:    { color: 0x773399, duration: 1200, maxScale: 2.5 }, // Amethyst Purple
      distant: { color: 0x1a3e62, duration: 1600, maxScale: 3.0 }, // Midnight Trench Blue
    };
    const ringConfig = ringConfigs[clue.signal] || ringConfigs['distant'];

    for (let r = 0; r < 2; r++) {
      const ring = this.add.graphics({ x, y });
      ring.lineStyle(2, ringConfig.color, 1);
      ring.strokeCircle(0, 0, 10);
      
      this.tweens.add({
        targets: ring,
        scaleX: ringConfig.maxScale,
        scaleY: ringConfig.maxScale,
        alpha: 0,
        delay: r * 200,
        duration: ringConfig.duration,
        ease: 'Quad.easeOut',
        onComplete: () => ring.destroy()
      });
    }
  }

  private playDryFire() {
    this.playSafeSound('miss', { volume: 0.2, detune: -1200 }); // click sound
    if (!this.registry.get('prefersReducedMotion')) {
      this.cameras.main.shake(50, 0.001);
    }
  }

  private playSafeSound(key: string, config?: Phaser.Types.Sound.SoundConfig) {
    if (this.cache.audio.exists(key)) {
      try {
        this.sound.play(key, config);
      } catch (err) {
        console.warn(`Failed to play sound: ${key}`, err);
      }
    }
  }
}
