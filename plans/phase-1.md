## Phase 1 — Phaser Board Prototype (Client-Only)

**Goal:** A fully playable game loop — aim, fire, clue, win — using hard-coded local cache positions. No server calls. This is where you validate that the core feel is right before wiring the backend.

**Estimated time:** 4 hours

### Tasks

**1.1 — `BootScene.ts` — asset loading and scale configuration**

```ts
class BootScene extends Phaser.Scene {
  preload() {
    // Load placeholder sprites: tile_unfired, tile_miss, tile_hit,
    // cannon, shell, cache_icon, particles
    // Use simple colored rectangles or free kenney.nl assets to start
  }
  create() {
    this.scene.start('HuntScene');
  }
}
```

Configure Phaser scale for responsive canvas inside the Devvit webview:

```ts
const config: Phaser.Types.Core.GameConfig = {
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 390,
    height: 600,
  },
  input: { activePointers: 3 },  // multi-touch support
};
```

> **Devvit note:** The game canvas runs inside an iframe managed by Devvit. Post height is configured via `devvit.json` entrypoints — the `game` entry defaults to `"tall"` (512px). Width varies from ~288–880px depending on device and viewport. Use `Phaser.Scale.FIT` to handle this automatically.

**1.2 — `HuntScene.ts` — board rendering**

Core tile grid:

```ts
// Hard-coded for Phase 1 testing — moves to server in Phase 3
const LOCAL_CACHES = [5, 22, 40];

class HuntScene extends Phaser.Scene {
  private tiles: Phaser.GameObjects.Image[] = [];
  private tileStates: ('unfired' | 'miss' | 'hit')[] = Array(48).fill('unfired');

  create() {
    this.buildGrid();
    this.buildCannon();
    this.setupInput();
    this.buildColumnLabels();  // A–F across the top
    this.buildRowLabels();     // 1–8 down the side
  }

  private cellToXY(index: number): { x: number; y: number } {
    const col = index % 6;
    const row = Math.floor(index / 6);
    return { x: GRID_ORIGIN_X + col * TILE_SIZE, y: GRID_ORIGIN_Y + row * TILE_SIZE };
  }

  private rowOf(index: number) { return Math.floor(index / 6); }
  private colOf(index: number) { return index % 6; }
}
```

**1.3 — Cannon aiming system**

Implement pointer drag → aim angle → target tile highlight:

```ts
setupInput() {
  this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
    if (!p.isDown) return;
    const targetIndex = this.pointerToCell(p.x, p.y);
    if (targetIndex !== null) this.showReticle(targetIndex);
    this.rotateCannon(p.x, p.y);
  });

  this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
    const targetIndex = this.pointerToCell(p.x, p.y);
    if (targetIndex !== null && this.tileStates[targetIndex] === 'unfired') {
      this.fire(targetIndex);
    } else if (targetIndex !== null) {
      this.playDryFire();  // "Already searched" feedback
    }
  });
}
```

**1.4 — Shell arc animation**

Use a Phaser tween along a parabolic path:

```ts
private fire(cellIndex: number) {
  const { x, y } = this.cellToXY(cellIndex);
  const shell = this.add.image(this.cannon.x, this.cannon.y, 'shell');

  this.tweens.add({
    targets: shell,
    x, y,
    duration: 400,
    ease: 'Quad.easeIn',
    onUpdate: (tween) => {
      // Arc: add sin curve to y mid-flight
      const progress = tween.progress;
      shell.y = Phaser.Math.Linear(this.cannon.y, y, progress)
                - Math.sin(progress * Math.PI) * 80;
    },
    onComplete: () => {
      shell.destroy();
      this.resolveShot(cellIndex);  // local resolution in Phase 1
    },
  });
  this.playCannonRecoil();
}
```

**1.5 — Local shot resolution**

```ts
private resolveShot(cellIndex: number) {
  const isHit = LOCAL_CACHES.includes(cellIndex);

  if (isHit) {
    this.tileStates[cellIndex] = 'hit';
    this.showHitEffect(cellIndex);
    this.foundCaches.push(cellIndex);
    if (this.foundCaches.length === 3) this.onRunComplete();
  } else {
    this.tileStates[cellIndex] = 'miss';
    this.showMissEffect(cellIndex);
    const clue = this.calcLocalClue(cellIndex);
    this.showClue(clue);
    this.misses++;
  }
  this.shots++;
  this.events.emit('shot-resolved', { shots: this.shots, misses: this.misses });
}
```

**1.6 — Manhattan distance clue (local)**

```ts
private calcLocalClue(fired: number): ClueData {
  const remaining = LOCAL_CACHES.filter(c => !this.foundCaches.includes(c));
  const firedRow = Math.floor(fired / 6), firedCol = fired % 6;
  const dist = Math.min(...remaining.map(c =>
    Math.abs(Math.floor(c / 6) - firedRow) + Math.abs((c % 6) - firedCol)
  ));
  const band = CLUE_BANDS.find(b => dist >= b.min && dist <= b.max)!;
  return { signal: band.signal, label: band.label };
}
```

**1.7 — Visual clue feedback**

Map signal strength to a sonar ring animation:

```ts
private showClue(clue: ClueData) {
  const ringConfig = {
    strong:  { color: 0x00ff88, scale: 0.6, alpha: 1.0, duration: 600 },
    near:    { color: 0x44ddff, scale: 0.8, alpha: 0.85, duration: 900 },
    weak:    { color: 0x8888ff, scale: 1.0, alpha: 0.65, duration: 1200 },
    distant: { color: 0x666688, scale: 1.2, alpha: 0.4,  duration: 1600 },
  }[clue.signal];
  // Spawn ring at fired tile, tween outward and fade
  // Emit signal label text above the tile for 2 seconds
}
```

**1.8 — Visual effects for hits and misses**

Miss effects:
- Tile texture swaps to cracked/spent sprite
- Dust puff particle emitter at tile position
- Subtle camera nudge: `this.cameras.main.shake(120, 0.003)`

Hit effects:
- Tile texture swaps to cache-found sprite with pop-up scale tween
- Bright particle burst at tile position
- Stronger camera shake: `this.cameras.main.shake(200, 0.008)`

Final cache hit:
- Brief slow-motion: `this.time.timeScale = 0.25`, reset after 800ms
- Board-wide confetti particle emitter
- Emit `'run-complete'` event to game.ts

**Exit criteria:** Play a full round locally — find all 3 hard-coded caches. Clues are informative and numerically correct. The cannon, arc, impact, and sonar animations all feel satisfying. No server calls anywhere yet.
