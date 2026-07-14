## Phase 2 — Game Shell & Client Architecture

**Goal:** Game entry point wraps Phaser cleanly. Views route correctly. Mobile layout works. Dark mode supported. The bridge between Phaser events and game.ts UI is solid.

**Estimated time:** 3 hours

### Tasks

**2.1 — `game.ts` — mount/unmount Phaser lifecycle**

The Phaser game is mounted in `game.html` / `game.ts` (the full game entry point). This is separate from `splash.html` which serves as the inline launch screen.

```ts
// src/client/game.ts
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { HuntScene } from './scenes/HuntScene';
import { ResultOverlay } from './scenes/ResultOverlay';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 390,
    height: 600,
  },
  scene: [BootScene, HuntScene, ResultOverlay],
  input: { activePointers: 3 },
  backgroundColor: '#1a1a2e',
};

const game = new Phaser.Game(config);

// === UI Overlay Management ===
// Phaser events drive DOM overlay updates

const shotCounter = document.getElementById('shot-counter')!;
const clueToast = document.getElementById('clue-toast')!;

// Listen for Phaser scene events via game.events
game.events.on('shot-resolved', (data: { shots: number; misses: number; foundCount: number }) => {
  shotCounter.innerHTML = `🎯 ${data.shots} shots · 💨 ${data.misses} misses · 📦 ${data.foundCount}/3 found`;
});

game.events.on('show-clue', (clue: { signal: string; label: string }) => {
  clueToast.textContent = clue.label;
  clueToast.className = `clue-toast clue-${clue.signal} visible`;
  setTimeout(() => { clueToast.className = 'clue-toast'; }, 2000);
});

game.events.on('run-complete', (result: unknown) => {
  // Show result overlay (Phase 4)
});
```

**2.2 — `game.html` — game entry point**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cache Hunt</title>
  <link rel="stylesheet" href="game.css" />
</head>
<body>
  <div id="app">
    <div id="creator-banner"></div>
    <div id="shot-counter">🎯 0 shots · 💨 0 misses · 📦 0/3 found</div>
    <div id="game-container"></div>
    <div id="clue-toast" class="clue-toast"></div>
    <div id="result-panel" class="hidden"></div>
    <div id="leaderboard-panel" class="hidden"></div>
  </div>
  <script type="module" src="game.ts"></script>
</body>
</html>
```

**2.3 — `splash.html` / `splash.ts` — inline launch screen**

The splash entry is the inline view shown in the Reddit feed. It should be lightweight — no Phaser here:

```html
<!-- src/client/splash.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cache Hunt</title>
  <link rel="stylesheet" href="splash.css" />
</head>
<body>
  <div class="splash">
    <h1 class="splash-title">Cache Hunt</h1>
    <p class="splash-subtitle">Aim your cannon and find 3 hidden caches!</p>
    <button class="splash-play" id="play-button">▶ Play</button>
  </div>
  <script type="module" src="splash.ts"></script>
</body>
</html>
```

> **Devvit note:** Inline mode should avoid scroll traps and heavy gesture hijacking so users can still scroll past the post. The `splash.html` entry with `"inline": true` in `devvit.json` renders in-feed; tapping "Play" opens the full `game.html` in expanded mode.

**2.4 — Client → Server communication**

In Devvit Web, the client communicates with the server using standard `fetch()` calls to `/api/` endpoints. **All client-side fetch requests MUST target endpoints starting with `/api/`.**

```ts
// src/client/api.ts — client-side API helpers
export async function fireAtCell(postId: string, cellIndex: number, requestId: string) {
  const res = await fetch('/api/fire-at-cell', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postId, cellIndex, requestId }),
  });
  if (!res.ok) throw new Error(`Shot failed: ${res.statusText}`);
  return res.json();
}

export async function getHuntView(postId: string) {
  const res = await fetch(`/api/hunt-view?postId=${postId}`);
  if (!res.ok) throw new Error(`Failed to load hunt: ${res.statusText}`);
  return res.json();
}

export async function getDailyHunt() {
  const res = await fetch('/api/daily-hunt');
  if (!res.ok) throw new Error(`Failed to load daily hunt: ${res.statusText}`);
  return res.json();
}
```

> **Important:** Client-side fetch can ONLY make requests to your own webview's `/api/` endpoints. No external domains. Authentication is handled automatically by Devvit.

**2.5 — Mobile-first CSS with dark mode**

Key constraints:
- Board container: `width: 100%; max-width: 420px; margin: 0 auto`
- Tile hit areas: minimum 44×44px (use transparent overlay if visual tiles are smaller)
- Bottom sheet pattern for leaderboard/stats to keep board in primary viewport
- Test at 375px width (iPhone SE) as the floor
- Support both light and dark modes via `prefers-color-scheme`

```css
/* src/client/game.css */

/* Light mode (default) */
:root {
  --bg-color: #f5f5f5;
  --text-color: #1a1a2e;
  --card-bg: #ffffff;
  --accent: #00ff88;
  --muted: #666688;
}

/* Dark mode — Devvit webviews receive the user's color scheme preference */
@media (prefers-color-scheme: dark) {
  :root {
    --bg-color: #1a1a2e;
    --text-color: #e0e0e0;
    --card-bg: #2a2a4e;
    --accent: #00ff88;
    --muted: #8888aa;
  }
}

body {
  margin: 0;
  padding: 0;
  background: var(--bg-color);
  color: var(--text-color);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

#app {
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.board-container {
  width: 100%;
  max-width: 420px;
  aspect-ratio: 6 / 8;
  position: relative;
}

/* Ensure touch targets meet 44px minimum */
.tile-hit-area {
  min-width: 44px;
  min-height: 44px;
  position: absolute;
}

.clue-toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  border-radius: 20px;
  font-weight: bold;
  opacity: 0;
  transition: opacity 0.3s;
}
.clue-toast.visible { opacity: 1; }
.clue-strong  { background: #00ff88; color: #003820; }
.clue-near    { background: #44ddff; color: #002840; }
.clue-weak    { background: #8888ff; color: #1a1a40; }
.clue-distant { background: #666688; color: #ffffff; }

.hidden { display: none; }
```

**2.6 — Accessibility baseline**

Add from the start — easier than retrofitting:

```ts
// Keyboard navigation for tile selection
// Press column letter (A–F) then row number (1–8) then Enter to fire

// Respect reduced motion
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Pass this flag into Phaser scenes to skip shake/slow-mo

// Clue announcements for screen readers
const ariaLive = document.getElementById('aria-live-region')!;
// Update when clue appears: ariaLive.textContent = clue.label;
```

```html
<!-- Add to game.html -->
<div id="aria-live-region" aria-live="polite" class="sr-only"></div>
```

**Exit criteria:** App renders on 375px and 1280px. Views show correctly in both light and dark mode. Shot counter and clue toast update in real time from Phaser events. Client API helpers make proper `/api/` calls (will get 404s until Phase 3 wires the server).
