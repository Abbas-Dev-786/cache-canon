## Phase 5 — Creator Flow & Custom Post Publishing

**Goal:** Any user can create a hunt, preview it, and publish it as a Reddit post in under 60 seconds.

**Estimated time:** 4 hours

### Tasks

**5.1 — `EditorScene.ts` — cache placement**

```ts
class EditorScene extends Phaser.Scene {
  private placedCaches: number[] = [];

  create() {
    this.buildGrid();  // Same grid as HuntScene but in edit mode

    // Tap to toggle cache placement
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const cell = this.pointerToCell(p.x, p.y);
      if (cell === null) return;

      if (this.placedCaches.includes(cell)) {
        this.placedCaches = this.placedCaches.filter(c => c !== cell);
        this.showTileEmpty(cell);
      } else if (this.placedCaches.length < 3) {
        this.placedCaches.push(cell);
        this.showTileCache(cell);
      }
      // Over-placement (>3): show shake animation and ignore

      this.game.events.emit('placement-changed', this.placedCaches);
    });
  }
}
```

**5.2 — Create Hunt UI (DOM in `game.html`)**

Add a create-hunt panel that shows when user navigates to "Create" mode:

```ts
// In game.ts — create hunt flow
function showCreateView() {
  const panel = document.getElementById('create-panel')!;
  panel.innerHTML = `
    <h2>Create a Hunt</h2>
    <input type="text" id="hunt-title" maxlength="60" placeholder="Give your hunt a title" />
    <span id="title-error" class="field-error hidden"></span>
    <div id="placement-counter">0/3 caches placed</div>
    <div id="editor-container"></div>
    <div class="create-actions">
      <button id="btn-preview" disabled>Preview</button>
    </div>
  `;
  panel.classList.remove('hidden');

  // Mount EditorScene into editor-container
  // ...

  game.events.on('placement-changed', (placements: number[]) => {
    document.getElementById('placement-counter')!.textContent =
      `${placements.length}/3 caches placed`;
    const title = (document.getElementById('hunt-title') as HTMLInputElement).value.trim();
    (document.getElementById('btn-preview') as HTMLButtonElement).disabled =
      placements.length !== 3 || !title;
  });

  document.getElementById('btn-preview')!.onclick = () => showPreview();
}

async function handlePublish(title: string, placements: number[]) {
  try {
    // Step 1: Create draft on server
    const draftRes = await fetch('/api/create-hunt-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, cacheCells: placements }),
    });
    const { draftId } = await draftRes.json();

    // Step 2: Publish (creates Reddit post)
    const pubRes = await fetch('/api/publish-hunt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId }),
    });
    const { postId, postUrl } = await pubRes.json();
    // Show success, navigate to new post
  } catch (e) {
    // Show error, let them retry
  }
}
```

**5.3 — `POST /api/create-hunt-draft` handler**

Add to `src/server/routes/api.ts`:

```ts
api.post('/create-hunt-draft', async (c) => {
  const { userId } = context;
  if (!userId) return c.json({ error: 'Login required' }, 401);

  const { title, cacheCells } = await c.req.json<{
    title: string; cacheCells: number[];
  }>();

  // Validate
  if (!title.trim() || title.length > 60) {
    return c.json({ error: 'Invalid title' }, 400);
  }
  if (cacheCells.length !== 3) {
    return c.json({ error: 'Exactly 3 caches required' }, 400);
  }
  if (new Set(cacheCells).size !== 3) {
    return c.json({ error: 'Caches must be on distinct tiles' }, 400);
  }
  if (cacheCells.some(c => c < 0 || c > 47)) {
    return c.json({ error: 'Invalid cell index' }, 400);
  }

  const draftId = crypto.randomUUID();
  await setJSON(keys.huntDraft(draftId, userId), {
    title: title.trim(),
    cacheCells,
    creatorId: userId,
    createdAt: Date.now(),
  }, 3600);  // expire in 1 hour if not published

  return c.json({ draftId });
});
```

**5.4 — `POST /api/publish-hunt` handler**

```ts
api.post('/publish-hunt', async (c) => {
  const { userId } = context;
  if (!userId) return c.json({ error: 'Login required' }, 401);

  const { draftId } = await c.req.json<{ draftId: string }>();

  const draft = await getJSON<HuntDraft>(keys.huntDraft(draftId, userId));
  if (!draft || draft.creatorId !== userId) {
    return c.json({ error: 'Draft not found' }, 404);
  }

  // Get username for attribution
  const username = await reddit.getCurrentUsername();

  // Create the custom post on Reddit
  // Use `entry` to reference the entrypoint defined in devvit.json
  // Use `textFallback` for Old Reddit, SEO, and safety checks
  // Use `styles` for loading background colors
  const post = await reddit.submitCustomPost({
    title: draft.title,
    entry: 'game',
    textFallback: {
      text: `🎯 Cache Hunt: ${draft.title}\n\nAim your cannon and find 3 hidden caches! Created by u/${username ?? 'unknown'}`,
    },
    styles: {
      backgroundColor: '#f5f5f5FF',
      backgroundColorDark: '#1a1a2eFF',
      height: 'TALL',
    },
  });

  // Store hunt config (private — includes cacheCells)
  const config: HuntConfig = {
    postId: post.id,
    creatorId: userId,
    creatorUsername: username ?? undefined,
    rows: 8,
    cols: 6,
    cacheCells: draft.cacheCells,
    title: draft.title,
    status: 'active',
    createdAt: Date.now(),
    isDaily: false,
  };
  await setJSON(keys.huntConfig(post.id), config);

  // Update creator stats
  await redis.hIncrBy(keys.creatorStats(userId), 'boardsCreated', 1);

  // Clean up draft
  await redis.del(keys.huntDraft(draftId, userId));

  return c.json({ postId: post.id, postUrl: post.url });
});
```

> **Key Devvit Web patterns used:**
> - `reddit.submitCustomPost()` with `entry` (NOT deprecated `preview`)
> - `textFallback` for Old Reddit/SEO/safety (up to 40,000 chars markdown)
> - `styles` with `#RRGGBBAA` format for loading background colors
> - `reddit.getCurrentUsername()` — preferred over full user fetch when only name needed
> - Import `reddit` from `@devvit/web/server` (NOT `context.reddit`)

**5.5 — Menu action to create a hunt (moderator shortcut)**

Update `src/server/routes/menu.ts`:

```ts
import { Hono } from 'hono';
import type { MenuItemRequest, UiResponse } from '@devvit/web/server';

export const menu = new Hono();

menu.post('/create-hunt', async (c) => {
  const _input = await c.req.json<MenuItemRequest>();
  // Show a form to collect title (optional — could also just navigate to create mode)
  return c.json<UiResponse>({
    showForm: {
      name: 'createHuntForm',
      form: {
        title: 'Create Cache Hunt',
        acceptLabel: 'Create',
        fields: [
          { name: 'title', label: 'Hunt title', type: 'string', required: true },
        ],
      },
    },
  });
});
```

**Exit criteria:** Creator places 3 caches, previews, publishes. The published post shows the creator's username. Cache positions are not visible in any client network request. Creator stats update. The post renders correctly with a textFallback on Old Reddit. Loading state shows correct background colors.
