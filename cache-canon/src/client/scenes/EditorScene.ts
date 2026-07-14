import { Scene } from 'phaser';
import * as Phaser from 'phaser';
import { BOARD } from '../../shared/constants';

export class EditorScene extends Scene {
  private tiles: Phaser.GameObjects.Image[] = [];
  private placedCaches: number[] = [];
  private helperText: Phaser.GameObjects.Text;

  constructor() {
    super('EditorScene');
  }

  create() {
    this.add.image(0, 0, 'bg').setOrigin(0, 0).setDisplaySize(390, 600).setDepth(-1);
    this.placedCaches = [];
    this.tiles = [];

    this.buildGrid();
    this.setupInput();

    // Helper Text at the bottom
    this.helperText = this.add.text(this.scale.width / 2, this.scale.height - 40, 'Select 3 tiles to hide your caches.', {
      fontFamily: 'Georgia, serif',
      fontSize: '16px',
      color: '#4a3320',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Reset UI state
    this.game.events.emit('placement-changed', this.placedCaches);
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
      y: originY + row * step,
    };
  }

  private buildGrid() {
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
        fontFamily: 'Georgia, serif',
        fontSize: '18px',
        color: '#4a3320',
        fontStyle: 'bold'
      }).setOrigin(0.5);
    }

    // 1-8 row labels on the left
    for (let row = 0; row < BOARD.ROWS; row++) {
      this.add.text(originX - 20, originY + row * step + tileW / 2, (row + 1).toString(), {
        fontFamily: 'Georgia, serif',
        fontSize: '18px',
        color: '#4a3320',
        fontStyle: 'bold'
      }).setOrigin(0.5);
    }
  }

  private setupInput() {
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const targetIndex = this.pointerToCell(p.x, p.y);
      if (targetIndex !== null) {
        this.toggleCache(targetIndex);
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

  private toggleCache(cellIndex: number) {
    const isPlaced = this.placedCaches.includes(cellIndex);
    const tile = this.tiles[cellIndex];

    if (isPlaced) {
      // Remove cache
      this.placedCaches = this.placedCaches.filter((c) => c !== cellIndex);
      if (tile) {
        tile.setTexture('tile_unfired');
        tile.setDisplaySize(40, 40);
      }
    } else {
      if (this.placedCaches.length >= 3) {
        // Shaking warning since we are at maximum
        this.cameras.main.shake(150, 0.003);
        return;
      }
      // Add cache
      this.placedCaches.push(cellIndex);
      if (tile) {
        tile.setTexture('tile_hit');
        tile.setDisplaySize(40, 40);
      }
      this.playPlacingEffect(cellIndex, true);
    }

    if (this.placedCaches.length === 3) {
      this.helperText.setText('Enter a title above and tap Publish!');
      this.helperText.setColor('#00ff88');
    } else {
      this.helperText.setText('Select 3 tiles to hide your caches.');
      this.helperText.setColor('#4a3320');
    }

    this.game.events.emit('placement-changed', this.placedCaches);
  }

  private playPlacingEffect(cellIndex: number, added: boolean) {
    const tile = this.tiles[cellIndex];
    if (tile) {
      tile.setDisplaySize(32, 32);
      this.tweens.add({
        targets: tile,
        displayWidth: 40,
        displayHeight: 40,
        duration: 150,
        ease: 'Back.easeOut',
      });
    }

    const { x, y } = this.cellToXY(cellIndex);
    const color = added ? 0x00ff88 : 0xff5555;
    const particles = this.add.particles(x, y, 'particle', {
      lifespan: 300,
      speed: { min: 20, max: 60 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: 'ADD',
      tint: color,
      maxParticles: 6,
    });
    this.time.delayedCall(400, () => particles.destroy());
  }
}
