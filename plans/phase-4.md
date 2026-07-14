## Phase 4 — Completion Flow & Leaderboard

**Goal:** A satisfying end-of-run experience with accurate scoring and a ranked leaderboard.

**Estimated time:** 3 hours

### Tasks

**4.1 — `ResultOverlay.ts` Phaser scene**

Triggered when `run-complete` fires from HuntScene:

```ts
class ResultOverlay extends Phaser.Scene {
  private result!: ShotResult;

  init(data: { result: ShotResult }) {
    this.result = data.result;
  }

  create() {
    // 1. Slow motion ramp-down (if not reduced motion)
    if (!this.registry.get('prefersReducedMotion')) {
      this.time.timeScale = 0.2;
      this.time.delayedCall(600, () => { this.time.timeScale = 1; });
    }

    // 2. Board-wide confetti burst
    this.spawnConfetti();

    // 3. After 1.2s, emit event to game.ts to show result DOM overlay
    this.time.delayedCall(1200, () => {
      this.game.events.emit('show-result', this.result);
    });
  }
}
```

**4.2 — Result panel (DOM overlay in `game.ts`)**

Show result stats in a DOM panel layered over the Phaser canvas:

```ts
// In game.ts — listen for the show-result event
game.events.on('show-result', (result: ShotResult) => {
  const panel = document.getElementById('result-panel')!;
  const { run, bestRank } = result;

  panel.innerHTML = `
    <div class="result-score">
      <span class="score-shots">${run.shots} shots</span>
      <span class="score-misses">${run.misses} misses</span>
      <span class="score-time">${(run.elapsedMs! / 1000).toFixed(1)}s</span>
    </div>
    ${bestRank ? `<div class="board-rank">You ranked #${bestRank} on this board</div>` : ''}
    <div class="result-actions">
      <button id="btn-replay">Try again</button>
      <button id="btn-leaderboard">See leaderboard</button>
    </div>
  `;
  panel.classList.remove('hidden');

  document.getElementById('btn-replay')!.onclick = () => {
    panel.classList.add('hidden');
    // Restart the HuntScene with fresh state
    game.scene.getScene('HuntScene')?.scene.restart();
  };

  document.getElementById('btn-leaderboard')!.onclick = () => {
    showLeaderboard();
  };
});
```

**4.3 — Leaderboard panel**

```ts
// In game.ts
async function showLeaderboard() {
  const panel = document.getElementById('leaderboard-panel')!;
  const data = await fetch(`/api/hunt-view?postId=${currentPostId}`).then(r => r.json());

  panel.innerHTML = `
    <h3>Leaderboard</h3>
    ${data.leaderboard.map((entry: LeaderboardEntry, i: number) => `
      <div class="leaderboard-row ${entry.userId === currentUserId ? 'is-me' : ''}">
        <span class="rank">#${i + 1}</span>
        <span class="username">u/${entry.username ?? 'Redditor'}</span>
        <span class="shots">${entry.shots} shots</span>
        <span class="time">${(entry.elapsedMs / 1000).toFixed(1)}s</span>
      </div>
    `).join('')}
    <button id="btn-close-lb">Close</button>
  `;
  panel.classList.remove('hidden');

  document.getElementById('btn-close-lb')!.onclick = () => {
    panel.classList.add('hidden');
  };
}
```

**4.4 — Restart a run**

When player hits "Try again":

```ts
// On client: HuntScene.restart() clears local Phaser tile states
// Server-side: fireAtCell accepts a new run for the same userId
// If a completed run exists, allow a fresh re-run
// Only the best completed result is ever ranked (checked via encodeRankScore comparison)
// Abandoned runs (never completed) are never ranked

// The server needs to support re-run by resetting the RunState:
// Add to /api/fire-at-cell — if run.completedAt is set and this is a new shot,
// create a fresh RunState (keeping the best result in huntResult key)
```

**4.5 — Replay incentive text**

```ts
function getReplayIncentive(run: PublicRunState, leaderboard: LeaderboardEntry[]): string {
  const best = leaderboard[0];
  if (!best) return '';
  if (run.shots > best.shots) return `Best is ${best.shots} shots — you used ${run.shots}`;
  if (run.shots === best.shots && run.elapsedMs! > best.elapsedMs) {
    return `You tied the best shot count — beat ${(best.elapsedMs / 1000).toFixed(1)}s`;
  }
  return `You're on top! 🏆`;
}
```

**Exit criteria:** Result card shows correct shots/misses/time. Leaderboard ranks correctly (fewer shots > fewer misses > faster time). Personal best updates on improvement. Server time controls ranking. All UI works via DOM overlays + `fetch('/api/...')` calls.
