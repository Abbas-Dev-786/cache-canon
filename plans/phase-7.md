## Phase 7 — Polish, Security Audit & Launch Prep

**Goal:** Launch-quality experience. Everything from the PRD release checklist passes.

**Estimated time:** 4 hours

### Tasks

**7.1 — Full Phaser animation pass**

Go back to every game moment and make it feel real:

| Moment | Animation details |
|---|---|
| Aim | Cannon pivots smoothly; use `Phaser.Math.Angle.BetweenPoints` and lerp rotation |
| Fire | Recoil tween: cannon pushes back 8px then springs forward; shell leaves a 3-frame trail |
| Miss | Tile cracks (swap to cracked texture); dust emitter (5–8 particles, brownish, gravity); camera nudge |
| Cache hit | Larger particle burst (20–30 golden particles); cache icon pops with scale 0.5→1.2→1.0 spring tween; stronger shake |
| Final cache | `time.timeScale = 0.2` for 600ms; confetti burst from all found cache tiles; smooth panel slide-in |
| Dry fire | "Already searched" text floats up from tile and fades; dry-click audio |

**7.2 — Audio integration**

All audio gated on first user gesture (browser autoplay policy):

```ts
// In BootScene
this.sound.setMute(true);
this.input.once('pointerdown', () => this.sound.setMute(false));

// Sounds: shell_whoosh, tile_crack, cache_found, final_fanfare, dry_click
// Use Web Audio API or Phaser's built-in sound manager
// Keep file sizes tiny: aim for < 50KB total audio
```

**7.3 — Accessibility pass**

```ts
// Keyboard navigation: A–F column + 1–8 row entry via keyboard
// E.g. press 'C' then '4' → highlight C4 → Enter to fire

// Reduced motion flag passed to all Phaser scenes
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// When true: no camera shake, no slow-motion, particle count × 0.1

// All tiles: aria-label="${col}${row}: ${state}"
// Sonar clue must also update an aria-live region (not just visual animation)
```

**7.4 — Logged-out user support**

Per Devvit documentation, games should be playable for logged-out users to reach a larger audience and improve featuring potential.

```ts
// In game.ts — detect logged-out state
// context.userId is available from server responses
// If /api/hunt-view returns userId: null, user is logged out

async function initGame() {
  const data = await fetch(`/api/hunt-view?postId=${postId}`).then(r => r.json());

  if (!data.run.userId) {
    // Logged-out: show board in read-only preview mode
    // Display "Log in to play" CTA
    showLoggedOutView(data);
  } else {
    // Logged-in: full gameplay
    startGameplay(data);
  }
}

function showLoggedOutView(data: HuntView) {
  // Show the board grid (all unfired) + stats
  // Show a "Sign in to play" button
  // On click: import { showLoginPrompt } from '@devvit/web/client';
  //           showLoginPrompt();
}
```

Use `showLoginPrompt` from `@devvit/web/client` at natural breakpoints:

```ts
import { showLoginPrompt } from '@devvit/web/client';

function onPlayButtonClick() {
  // If not logged in, prompt login
  if (!isLoggedIn) {
    showLoginPrompt();
    return;
  }
  // Otherwise start game
}
```

> **Best practice:** Trigger `showLoginPrompt()` only at natural stopping points (before starting gameplay, on results screen). The login flow reloads the page, so any in-memory game state will be lost.

**7.5 — Error and edge case handling**

Every failure path needs a recoverable state:

```ts
// fireAtCell network failure → show "Shot failed — tap to retry" on the tile
// Already fired → dry-fire animation, no state change, no error toast
// Expired board → "This hunt has ended" with link to Daily Hunt
// Incomplete board → prevented at publish time; add server-side guard anyway
// Logged-out viewer → board renders in read-only mode; "Log in to play" CTA

// Retry logic: preserve the requestId so the server deduplicates on retry
async function fireWithRetry(postId: string, cellIndex: number, retries = 2) {
  const requestId = crypto.randomUUID();
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch('/api/fire-at-cell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, cellIndex, requestId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}
```

**7.6 — Security/privacy final audit**

Work through every data path and check each box:

- [ ] `POST /api/fire-at-cell` response: no `cacheCells`, no unfired cache positions
- [ ] `GET /api/hunt-view` response: no `cacheCells` field in JSON
- [ ] Realtime events: publish only `{ type, postId }`, never tile data
- [ ] Post data: only public metadata (title, creator username, status)
- [ ] Text fallback: "Aim your cannon and find 3 hidden caches!" — no cache data
- [ ] Error messages: no leakage of internal state or cache positions
- [ ] Timer: first `startedAt` is set by server, not client
- [ ] Timer: `completedAt` is set by server on final cache confirmation

**7.7 — Optional: Realtime leaderboard refresh**

After a player completes a run, push a minimal event to other viewers. Use the correct Devvit Web Realtime APIs:

**Server-side** — send via `@devvit/web/server`:

```ts
import { realtime } from '@devvit/web/server';

// After leaderboard upsert in /api/fire-at-cell:
await realtime.send(`hunt-${postId}`, {
  type: 'leaderboard-updated',
  postId,
});
```

> **Critical:** Channel names **cannot contain the `:` character**. Use hyphens instead (e.g., `hunt-${postId}` NOT `hunt:${postId}`).

**Client-side** — subscribe via `@devvit/web/client`:

```ts
import { connectRealtime } from '@devvit/web/client';

// Connect to leaderboard updates for this post
const connection = await connectRealtime({
  channel: `hunt-${postId}`,
  onConnect: (channel) => {
    console.log(`Connected to ${channel}`);
  },
  onDisconnect: (channel) => {
    console.log(`Disconnected from ${channel}`);
  },
  onMessage: async (data) => {
    if (data.type === 'leaderboard-updated') {
      // Refetch and update the leaderboard display
      const fresh = await fetch(`/api/hunt-view?postId=${postId}`).then(r => r.json());
      updateLeaderboardDisplay(fresh.leaderboard, fresh.stats);
    }
  },
});

// Clean up on page unload
window.addEventListener('beforeunload', () => connection.disconnect());
```

> **Realtime limits:** 1 MB max message payload, 100 messages/second per installation.

**7.8 — Share customization**

Use `showShareSheet` from `@devvit/web/client` for sharing results:

```ts
import { showShareSheet } from '@devvit/web/client';

function shareResult(run: PublicRunState, huntTitle: string) {
  showShareSheet({
    title: `I completed "${huntTitle}"!`,
    text: `Found all 3 caches in ${run.shots} shots. Can you beat me?`,
  });
}
```

**7.9 — Final test matrix**

Run through every scenario before submitting:

| Scenario | Pass criteria |
|---|---|
| New hunter, first board | Completes without reading a tutorial |
| Creator publishes board | Under 60 seconds from open to published post |
| Mobile 375px | All tap targets ≥ 44px; board fits viewport without horizontal scroll |
| Desktop 1280px | Board centered; leaderboard/stats visible alongside |
| Dark mode | Colors match dark theme; no white flash on load |
| Slow network / timeout | Retry prompt appears; no duplicate shots registered |
| Logged-out viewer | Board visible; "Log in to play" shown; no game state created |
| Daily Hunt day change | New board loads; streak updates correctly |
| Concurrent fire requests | Only first shot registered; second returns idempotent result |
| Already-fired tile | Dry-fire animation; no score change; no API error |
| Reduced motion preference | No shake, no slow-mo; text feedback still works |
| Privacy check | No cache positions visible in DevTools Network tab |
| Old Reddit / text fallback | textFallback text visible on old.reddit.com |

---

## Appendix A — Redis Key Reference

```
hunt-{postId}-config              String/JSON: HuntConfig (PRIVATE — contains cacheCells)
hunt-{postId}-run-{userId}        String/JSON: RunState
hunt-{postId}-stats               Hash: plays, completions, totalShots
hunt-{postId}-leaderboard         Sorted set: member=userId, score=rankScore (lower=better)
hunt-{postId}-result-{userId}     String/JSON: best completed RunState for display
hunt-draft-{draftId}-{userId}     String/JSON: HuntDraft (expires in 1 hour)
creator-{userId}-stats            Hash: boardsCreated, totalPlays, totalCompletions
daily-{YYYY-MM-DD}-post           String: postId
daily-queue                       Sorted set: member=postId, score=order (FIFO via zRange)
daily-streak-{userId}             String/JSON: DailyStreak
```

> **Note:** No colons in key names for consistency with Realtime channel naming (which forbids colons). Devvit Redis does NOT support key scanning/listing, so all keys must be discoverable via known patterns.

---

## Appendix B — Rank Score Encoding

```
rankScore = shots × 1,000,000,000
           + misses × 1,000,000
           + min(elapsedMs, 999,999)
```

Lower is better. Assumptions: max 999 shots before integer overflow; max 999 misses; runs over 1000 seconds are capped (abandoned runs rejected before insertion). Store raw result separately for display; use encoded score only for sorted-set ordering.

---

## Appendix C — Supported Redis Data Types

Per Devvit documentation, Redis supports:
- ✅ Strings (`get`, `set`, `del`, `exists`, `rename`)
- ✅ Hashes (`hSet`, `hGet`, `hGetAll`, `hIncrBy`, `hDel`, `hScan`, `hKeys`)
- ✅ Sorted Sets (`zAdd`, `zRem`, `zRange`, `zRank`, `zScore`, `zIncrBy`, `zRangeByScore`)
- ✅ Numbers (`incrBy`)
- ✅ Bitfields
- ✅ Transactions (`watch`, `multi`, `exec`, `discard`, `unwatch`)

**NOT supported:**
- ❌ Lists (`lPush`, `lPop`, `rPush`, `rPop`) — use sorted sets with timestamp scores
- ❌ Plain Sets (`sAdd`, `sMembers`) — use sorted sets with score=0
- ❌ Key scanning (`SCAN`, `KEYS`) — use stable collection keys

---

## Appendix D — Timeline Summary

| Phase | Focus | Est. Hours | Cumulative |
|---|---|---:|---:|
| 0 | Scaffold, types, folder structure | 1h | 1h |
| 1 | Phaser board prototype (local only) | 4h | 5h |
| 2 | Game shell, dark mode, mobile layout | 3h | 8h |
| 3 | Server handlers (Hono), Redis, security | 5h | 13h |
| 4 | Completion flow, leaderboard | 3h | 16h |
| 5 | Creator editor, draft, publish | 4h | 20h |
| 6 | Daily Hunt, streaks, seeded boards | 3h | 23h |
| 7 | Polish, security audit, launch prep | 4h | 27h |
| **Total** | | **27h** | |

**Hackathon tip:** Phases 0–4 give you a fully playable, server-authoritative game. Ship that first, then add creator flow (Phase 5) and Daily Hunt (Phase 6). Phase 7 polish can be parallel with Phase 5/6 if you have multiple people.
