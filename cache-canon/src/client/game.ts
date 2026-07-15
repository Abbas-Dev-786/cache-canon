import { Boot } from './scenes/Boot';
import { HuntScene } from './scenes/HuntScene';
import { ResultOverlay } from './scenes/ResultOverlay';
import { EditorScene } from './scenes/EditorScene';
import * as Phaser from 'phaser';
import { AUTO, Game } from 'phaser';
import { context, showLoginPrompt, connectRealtime, showShareSheet, showToast, navigateTo } from '@devvit/web/client';
import type { LeaderboardEntry, ShotResult, HuntView } from '../shared/types';

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  parent: 'game-container',
  backgroundColor: '#1a1a2e',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 390,
    height: 600,
  },
  scene: [Boot, HuntScene, ResultOverlay, EditorScene],
};

const StartGame = (parent: string) => {
  return new Game({ ...config, parent });
};

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function getReplayIncentive(run: { shots: number; elapsedMs?: number }, leaderboard: LeaderboardEntry[]): string {
  const best = leaderboard[0];
  if (!best) return 'Be the first to set a score!';
  if (run.shots > best.shots) {
    return `Best is ${best.shots} shots — you used ${run.shots}. Can you beat it?`;
  }
  if (run.shots === best.shots) {
    const elapsedMs = run.elapsedMs ?? Infinity;
    if (elapsedMs > best.elapsedMs) {
      const diff = (elapsedMs - best.elapsedMs) / 1000;
      return `You tied the best shot count! Beat it by ${formatTime(diff)} to take #1.`;
    }
  }
  return `You are currently in #1 place! 🏆`;
}

document.addEventListener('DOMContentLoaded', () => {
  const game = StartGame('game-container');

  // DOM Elements
  const creatorTag = document.getElementById('creator-tag')!;
  const shotCounter = document.getElementById('shot-counter')!;
  const clueToast = document.getElementById('clue-toast')!;
  const victoryModal = document.getElementById('victory-modal')!;
  const modalTitle = victoryModal.querySelector('.modal-title') as HTMLHeadingElement;
  const resShots = document.getElementById('res-shots')!;
  const resMisses = document.getElementById('res-misses')!;
  const resTime = document.getElementById('res-time')!;
  const resRank = document.getElementById('res-rank')!;
  const resIncentive = document.getElementById('res-incentive')!;
  
  const btnHelp = document.getElementById('btn-help')!;
  const helpModal = document.getElementById('help-modal')!;
  const btnCloseHelp = document.getElementById('btn-close-help')!;
  
  const btnShare = document.getElementById('btn-share')!;
  const btnLeaderboard = document.getElementById('btn-leaderboard')!;
  const btnGoCreate = document.getElementById('btn-go-create')!;
  const announcer = document.getElementById('accessibility-announcer')!;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  game.registry.set('prefersReducedMotion', prefersReducedMotion);

  let realtimeConnection: any = null;
  let lastResult: ShotResult | null = null;
  let currentHuntTitle: string = 'Cache Cannon';

  async function connectToRealtime(postId: string) {
    if (realtimeConnection) {
      realtimeConnection.disconnect();
    }
    try {
      const channelName = `hunt_${postId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      realtimeConnection = await connectRealtime({
        channel: channelName,
        onMessage: (data: any) => {
          if (data?.type === 'leaderboard-updated' && !leaderboardPage.classList.contains('hidden')) {
            refreshLeaderboard();
          }
        },
      });
    } catch (e) {
      console.warn('Realtime connection failed:', e);
    }
  }

  game.events.on('hunt-loaded', (postId: string) => {
    connectToRealtime(postId);
  });

  async function refreshLeaderboard() {
    leaderboardList.innerHTML = '<div class="loading">Loading leaderboard...</div>';
    try {
      const url = isDailyModeActive && dailyPostId 
        ? `/api/hunt-view?postId=${dailyPostId}` 
        : '/api/hunt-view';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const data = await res.json() as HuntView;

      leaderboardList.innerHTML = data.leaderboard.length > 0 
        ? data.leaderboard.slice(0, 5).map((entry, i) => {
            const isMe = entry.userId === context.userId;
            const timeStr = formatTime(entry.elapsedMs / 1000);
            const flair = i === 0 ? '☠️ ' : '🧭 ';
            return `
              <div class="leaderboard-row ${isMe ? 'is-me' : ''}">
                <span class="rank">#${i + 1}</span>
                <span class="username">${flair}${entry.username || 'Redditor'}</span>
                <span class="score">${entry.shots}s / ${entry.misses}m / ${timeStr}</span>
              </div>
            `;
          }).join('')
        : '<div class="empty" style="padding: 20px; color: #8888aa;">No scores logged yet. Be the first!</div>';
    } catch (err) {
      leaderboardList.innerHTML = '<div class="error" style="padding: 20px; color: #ff5555;">Failed to load leaderboard.</div>';
    }
  }

  const headerBar = document.getElementById('header-bar')!;
  const statsBar = document.getElementById('stats-bar')!;

  // Leaderboard Elements
  const leaderboardPage = document.getElementById('leaderboard-page')!;
  const leaderboardList = document.getElementById('leaderboard-list')!;
  const btnCloseLb = document.getElementById('btn-close-lb')!;

  // Creator Elements
  const creatorBar = document.getElementById('creator-bar')!;
  const btnReadyPublish = document.getElementById('btn-ready-publish') as HTMLButtonElement;
  const placementCounter = document.getElementById('placement-counter')!;
  const btnCancelCreate = document.getElementById('btn-cancel-create')!;

  const publishModal = document.getElementById('publish-modal')!;
  const huntTitleInput = document.getElementById('hunt-title') as HTMLInputElement;
  const titleLengthCounter = document.getElementById('title-length-counter')!;
  const btnPublish = document.getElementById('btn-publish') as HTMLButtonElement;
  const btnClosePublish = document.getElementById('btn-close-publish')!;

  // Daily Mode Elements
  const btnDailyMode = document.getElementById('btn-daily-mode')!;
  const streakTag = document.getElementById('streak-tag')!;

  let isDailyModeActive = false;
  let dailyPostId: string | null = null;

  // Dynamic user welcome in tag
  creatorTag.textContent = `Player: u/${context.username ?? 'Hunter'}`;

  // Fetch and show streak on load
  updateStreakDisplay();

  function updateStreakDisplay() {
    const tzOffset = new Date().getTimezoneOffset();
    fetch(`/api/daily-streak?tzOffset=${tzOffset}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (data.streak && data.streak.currentStreak > 0) {
          streakTag.textContent = `🔥 ${data.streak.currentStreak} days`;
          streakTag.classList.remove('hidden');
        } else {
          streakTag.classList.add('hidden');
        }
      })
      .catch(() => {});
  }

  // Phaser event subscriptions
  game.events.on('prompt-login', () => {
    showLoginPrompt();
  });

  game.events.on('shot-resolved', (data: { shots: number; misses: number; foundCount: number; completed: boolean }) => {
    shotCounter.textContent = `🎯 ${data.shots} shots · 💨 ${data.misses} misses · 📦 ${data.foundCount}/3 found`;
    
    const msg = `Total shots: ${data.shots}. Misses: ${data.misses}. Caches found: ${data.foundCount} of 3.`;
    announcer.textContent = msg;
  });

  let toastTimeout: ReturnType<typeof setTimeout> | null = null;
  game.events.on('show-clue', (clue: { signal: string; label: string }) => {
    if (toastTimeout) clearTimeout(toastTimeout);
    
    clueToast.textContent = clue.label;
    clueToast.className = `clue-toast visible`;
    announcer.textContent = `Clue: ${clue.label}`;

    toastTimeout = setTimeout(() => {
      clueToast.classList.remove('visible');
    }, 2000);
  });

  game.events.on('show-result', (result: ShotResult & { alreadyCompleted?: boolean }) => {
    lastResult = result;
    
    if (result.alreadyCompleted) {
      modalTitle.textContent = 'ALREADY SOLVED';
      resIncentive.classList.add('hidden');
    } else {
      modalTitle.textContent = 'VICTORY!';
      resIncentive.classList.remove('hidden');
    }

    resShots.textContent = result.run.shots.toString();
    resMisses.textContent = result.run.misses.toString();
    
    const elapsedSeconds = result.run.elapsedMs ? result.run.elapsedMs / 1000 : 0;
    resTime.textContent = formatTime(elapsedSeconds);

    if (result.bestRank) {
      resRank.textContent = `Rank: #${result.bestRank}`;
      resRank.classList.remove('hidden');
    } else {
      resRank.textContent = '';
      resRank.classList.add('hidden');
    }

    // Refresh streak badge if we completed a daily hunt
    if (isDailyModeActive) {
      updateStreakDisplay();
    }

    const url = isDailyModeActive && dailyPostId 
      ? `/api/hunt-view?postId=${dailyPostId}` 
      : '/api/hunt-view';

    // Generate replay incentive text
    fetch(url, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: HuntView) => {
        currentHuntTitle = data.title;
        const incentive = getReplayIncentive(result.run, data.leaderboard);
        resIncentive.textContent = incentive;
      })
      .catch(() => {
        resIncentive.textContent = '';
      });

    victoryModal.classList.remove('hidden');
    announcer.textContent = `Victory! Hunt complete in ${result.run.shots} shots.`;
  });

  // Modal Actions
  btnShare.addEventListener('click', () => {
    if (!lastResult) return;
    showShareSheet({
      title: `I completed "${currentHuntTitle}"!`,
      text: `Found all 3 caches in ${lastResult.run.shots} shots. Can you beat me?`,
    });
  });

  btnLeaderboard.addEventListener('click', () => {
    leaderboardPage.classList.remove('hidden');
    refreshLeaderboard();
  });

  btnCloseLb.addEventListener('click', () => {
    leaderboardPage.classList.add('hidden');
  });

  btnHelp.addEventListener('click', () => {
    helpModal.classList.remove('hidden');
  });

  btnCloseHelp.addEventListener('click', () => {
    helpModal.classList.add('hidden');
  });

  // Daily Mode Toggle Click Handler
  btnDailyMode.addEventListener('click', async () => {
    if (isDailyModeActive) {
      // Exit Daily Mode
      isDailyModeActive = false;
      btnDailyMode.classList.remove('active');
      btnDailyMode.textContent = 'Daily Hunt';
      
      victoryModal.classList.add('hidden');
      game.scene.start('HuntScene');
    } else {
      btnDailyMode.textContent = 'Loading...';
      
      try {
        const tzOffset = new Date().getTimezoneOffset();
        const res = await fetch(`/api/daily-hunt?tzOffset=${tzOffset}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('No daily hunt set');
        const data = await res.json() as HuntView;

        isDailyModeActive = true;
        dailyPostId = data.postId;
        btnDailyMode.classList.add('active');
        btnDailyMode.textContent = 'Exit Daily';

        victoryModal.classList.add('hidden');
        game.scene.start('HuntScene', { huntId: dailyPostId });
      } catch (err) {
        console.error(err);
        btnDailyMode.textContent = 'Daily Hunt';
        showToast("Today's Daily Hunt is not ready yet! Try again in a bit.");
      }
    }
  });

  // Creator mode trigger from victory screen
  btnGoCreate.addEventListener('click', () => {
    if (!context.userId) {
      showLoginPrompt();
      return;
    }
    victoryModal.classList.add('hidden');
    
    // UI state switch to creator
    headerBar.classList.add('hidden');
    statsBar.classList.add('hidden');
    creatorBar.classList.remove('hidden');

    huntTitleInput.value = '';
    titleLengthCounter.textContent = '0/60';
    btnPublish.disabled = true;
    btnPublish.textContent = 'Publish';
    btnReadyPublish.disabled = true;

    // Start EditorScene
    game.scene.start('EditorScene');
  });

  btnCancelCreate.addEventListener('click', () => {
    creatorBar.classList.add('hidden');
    headerBar.classList.remove('hidden');
    statsBar.classList.remove('hidden');

    if (isDailyModeActive && dailyPostId) {
      game.scene.start('HuntScene', { huntId: dailyPostId });
    } else {
      game.scene.start('HuntScene');
    }
  });

  let currentPlacements: number[] = [];

  game.events.on('placement-changed', (placements: number[]) => {
    currentPlacements = placements;
    placementCounter.textContent = `Place Caches: ${placements.length}/3`;
    btnReadyPublish.disabled = placements.length !== 3;
    validateCreatorForm();
  });

  huntTitleInput.addEventListener('input', () => {
    titleLengthCounter.textContent = `${huntTitleInput.value.length}/60`;
    validateCreatorForm();
  });

  function validateCreatorForm() {
    const title = huntTitleInput.value.trim();
    btnPublish.disabled = currentPlacements.length !== 3 || !title || title.length > 60;
  }

  btnReadyPublish.addEventListener('click', () => {
    publishModal.classList.remove('hidden');
    validateCreatorForm();
  });

  btnClosePublish.addEventListener('click', () => {
    publishModal.classList.add('hidden');
  });

  btnPublish.addEventListener('click', async () => {
    const title = huntTitleInput.value.trim();
    if (!title || currentPlacements.length !== 3) return;

    btnPublish.disabled = true;
    btnPublish.textContent = 'Publishing...';

    try {
      // Step 1: Create draft
      const draftRes = await fetch('/api/create-hunt-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, cacheCells: currentPlacements }),
      });
      if (!draftRes.ok) throw new Error();
      const { draftId } = await draftRes.json();

      // Step 2: Publish
      const pubRes = await fetch('/api/publish-hunt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId }),
      });
      if (!pubRes.ok) throw new Error();
      const { postUrl } = await pubRes.json();

      // Success cleanup
      publishModal.classList.add('hidden');
      creatorBar.classList.add('hidden');
      headerBar.classList.remove('hidden');
      statsBar.classList.remove('hidden');
      announcer.textContent = 'Hunt published successfully!';

      if (postUrl) {
        navigateTo(postUrl);
      } else {
        game.scene.start('HuntScene');
      }
    } catch (err) {
      console.error(err);
      announcer.textContent = 'Failed to publish board.';
      btnPublish.disabled = false;
      btnPublish.textContent = 'Publish';
      showToast('Failed to publish board. Check title/placements and try again.');
    }
  });

  // Keyboard Accessibility Navigation
  let selectedCol: string | null = null;
  window.addEventListener('keydown', (e) => {
    const key = e.key.toUpperCase();
    
    // A-F column selection
    if (['A', 'B', 'C', 'D', 'E', 'F'].includes(key)) {
      selectedCol = key;
      announcer.textContent = `Selected Column ${selectedCol}`;
      console.log(`Keyboard: selected column ${selectedCol}`);
    } 
    // 1-8 row selection
    else if (['1', '2', '3', '4', '5', '6', '7', '8'].includes(key) && selectedCol !== null) {
      const rowIdx = parseInt(key) - 1;
      const colIdx = selectedCol.charCodeAt(0) - 65;
      const cellIdx = rowIdx * 6 + colIdx;
      
      announcer.textContent = `Selected tile ${selectedCol}${key}.`;
      console.log(`Keyboard: target cell index ${cellIdx} (${selectedCol}${key})`);
      
      // Notify active HuntScene to target this tile
      const huntScene = game.scene.getScene('HuntScene') as any;
      if (huntScene && typeof huntScene.resolveShot === 'function') {
        const state = huntScene.tileStates[cellIdx];
        if (state === 'unfired') {
          huntScene.fire(cellIdx);
        } else {
          announcer.textContent = `${selectedCol}${key} has already been searched.`;
        }
      }
      selectedCol = null; // Reset selection
    }
  });
});
