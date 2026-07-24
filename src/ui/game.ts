import { Board } from '../game/board';
import { computeGrid } from '../puzzle/grid';
import { icon, icons } from './icons';
import { isMuted, toggleMuted } from '../audio/sfx';
import { animate } from './motion';
import { burstConfetti } from './confetti';
import { loadSettings } from '../game/settings';
import { computeScore, recordSolve, breakStreak, loadStats } from '../game/stats';

// Hosts a running puzzle: header with progress + controls, the board itself,
// and a win overlay. Chooses a cell size that fits the viewport.

export interface GameCallbacks {
  onExit: () => void;
  onRestart: () => void;
}

/** mm:ss from milliseconds. */
function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function renderGame(
  root: HTMLElement,
  image: HTMLImageElement,
  baseTiles: number,
  cb: GameCallbacks,
): void {
  root.innerHTML = '';

  const settings = loadSettings();

  // Solve tracking. The clock starts when play begins (after the reveal +
  // shuffle) and stops on win.
  let startTime = 0;
  let elapsedMs = 0;
  let moves = 0;
  let timerId: number | null = null;
  let finished = false;

  const grid = computeGrid(image.naturalWidth, image.naturalHeight, baseTiles);

  // Fit the grid within the viewport, leaving room for the header and padding.
  // Reserve space for the ~73px header and the board area's padding.
  const HEADER = 73;
  const PAD = 32;
  const maxBoardW = Math.min(window.innerWidth - PAD, 1000);
  const maxBoardH = window.innerHeight - HEADER - PAD;
  const fitCell = Math.floor(
    Math.min(maxBoardW / grid.cols, maxBoardH / grid.rows),
  );
  // Keep tiles tappable but let fine grids shrink well below the old floor;
  // if even this minimum overflows, the board area scrolls (overflow-auto).
  const MIN_CELL = 22;
  const safeCell = Math.max(MIN_CELL, fitCell);

  const container = document.createElement('div');
  container.className = 'min-h-screen w-full flex flex-col';

  // Header
  const header = document.createElement('header');
  header.className =
    'flex items-center justify-between gap-4 px-5 py-4 border-b border-base-700/60';

  const backBtn = document.createElement('button');
  backBtn.className =
    'flex items-center gap-2 px-4 py-2 rounded-full bg-base-800 hover:bg-base-700 transition-colors text-sm font-medium';
  backBtn.appendChild(icon(icons.back, 'w-4 h-4'));
  backBtn.appendChild(document.createTextNode('Menu'));
  backBtn.addEventListener('click', () => {
    board.destroy();
    cb.onExit();
  });
  header.appendChild(backBtn);

  // Center cluster: progress, plus optional timer and streak chips.
  const centerCluster = document.createElement('div');
  centerCluster.className = 'flex items-center gap-3 text-sm font-medium tabular-nums';

  const progress = document.createElement('div');
  progress.className = 'text-slate-300';
  centerCluster.appendChild(progress);

  // Live timer chip (only when enabled).
  const timerChip = document.createElement('div');
  timerChip.className =
    'flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-base-800 text-slate-200';
  timerChip.appendChild(icon(icons.timer, 'w-3.5 h-3.5 text-slate-400'));
  const timerText = document.createElement('span');
  timerText.textContent = '0:00';
  timerChip.appendChild(timerText);
  if (settings.timer) centerCluster.appendChild(timerChip);

  // Streak chip (only when enabled and there's a live streak to show).
  const streakChip = document.createElement('div');
  streakChip.className =
    'flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300';
  streakChip.appendChild(icon(icons.streak, 'w-3.5 h-3.5'));
  const streakText = document.createElement('span');
  streakChip.appendChild(streakText);
  const refreshStreakChip = () => {
    const cur = loadStats().currentStreak;
    streakText.textContent = `${cur}`;
    streakChip.classList.toggle('hidden', !(settings.streak && cur > 0));
  };
  refreshStreakChip();
  if (settings.streak) centerCluster.appendChild(streakChip);

  header.appendChild(centerCluster);

  const rightControls = document.createElement('div');
  rightControls.className = 'flex items-center gap-2';

  // Mute toggle. Icon reflects current state; click flips and persists it.
  const muteBtn = document.createElement('button');
  muteBtn.className =
    'flex items-center justify-center w-10 h-10 rounded-full bg-base-800 hover:bg-base-700 transition-colors';
  muteBtn.setAttribute('aria-label', 'Toggle sound');
  const renderMuteIcon = () => {
    muteBtn.innerHTML = '';
    muteBtn.appendChild(
      icon(isMuted() ? icons.soundOff : icons.soundOn, 'w-4 h-4'),
    );
    muteBtn.title = isMuted() ? 'Sound off' : 'Sound on';
  };
  renderMuteIcon();
  muteBtn.addEventListener('click', () => {
    toggleMuted();
    renderMuteIcon();
    animate(
      muteBtn,
      [{ transform: 'scale(0.85)' }, { transform: 'scale(1)' }],
      { duration: 180, easing: 'ease-out' },
    );
  });
  rightControls.appendChild(muteBtn);

  // Peek: briefly reveal the completed image over the board as a hint.
  const peekBtn = document.createElement('button');
  peekBtn.className =
    'flex items-center gap-2 px-4 py-2 rounded-full bg-base-800 hover:bg-base-700 transition-colors text-sm font-medium';
  peekBtn.appendChild(icon(icons.peek, 'w-4 h-4'));
  peekBtn.appendChild(document.createTextNode('Peek'));
  peekBtn.setAttribute('aria-label', 'Peek at the full image');
  peekBtn.addEventListener('click', () => {
    board.peek();
    animate(
      peekBtn,
      [{ transform: 'scale(0.9)' }, { transform: 'scale(1)' }],
      { duration: 180, easing: 'ease-out' },
    );
  });
  rightControls.appendChild(peekBtn);

  const restartBtn = document.createElement('button');
  restartBtn.className =
    'flex items-center gap-2 px-4 py-2 rounded-full bg-base-800 hover:bg-base-700 transition-colors text-sm font-medium';
  restartBtn.appendChild(icon(icons.restart, 'w-4 h-4'));
  restartBtn.appendChild(document.createTextNode('Restart'));
  restartBtn.addEventListener('click', () => {
    board.destroy();
    cb.onRestart();
  });
  rightControls.appendChild(restartBtn);

  header.appendChild(rightControls);

  container.appendChild(header);

  // Board area. Scrolls when a fine grid is larger than the viewport; the
  // inner wrapper uses margin:auto so the board stays centred when it fits but
  // pins to the top-left (not clipped) when it overflows.
  const boardArea = document.createElement('div');
  boardArea.className = 'flex-1 flex overflow-auto';
  const boardCenter = document.createElement('div');
  boardCenter.className = 'm-auto p-4';
  boardArea.appendChild(boardCenter);
  container.appendChild(boardArea);

  root.appendChild(container);

  const stopTimer = () => {
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = null;
    }
  };

  const board = new Board(boardCenter, image, grid, safeCell, {
    onProgress: (correct, total) => {
      progress.textContent = `${correct} / ${total} in place`;
    },
    onMove: (m) => {
      moves = m;
    },
    onReady: () => {
      // Play has begun — start the clock.
      startTime = performance.now();
      if (settings.timer) {
        timerId = window.setInterval(() => {
          elapsedMs = performance.now() - startTime;
          timerText.textContent = formatTime(elapsedMs);
        }, 250);
      }
    },
    onWin: () => {
      finished = true;
      stopTimer();
      elapsedMs = startTime ? performance.now() - startTime : 0;
      const total = board.total;
      const score = computeScore(total, elapsedMs, moves);
      const { stats, newBestScore, newBestTime } = recordSolve(
        { score, timeMs: elapsedMs, tiles: total, moves },
        settings.streak,
      );
      showWin(root, board, cb, {
        settings,
        timeMs: elapsedMs,
        moves,
        score,
        stats,
        newBestScore,
        newBestTime,
      });
    },
  });

  // Exiting or restarting a puzzle mid-solve breaks the streak.
  const abandonIfUnfinished = () => {
    stopTimer();
    if (!finished && settings.streak) breakStreak();
  };
  backBtn.addEventListener('click', abandonIfUnfinished);
  restartBtn.addEventListener('click', abandonIfUnfinished);

  // Reveal the finished picture, then shuffle into play.
  board.start(1200);
}

interface WinInfo {
  settings: ReturnType<typeof loadSettings>;
  timeMs: number;
  moves: number;
  score: number;
  stats: ReturnType<typeof loadStats>;
  newBestScore: boolean;
  newBestTime: boolean;
}

function showWin(
  root: HTMLElement,
  board: Board,
  cb: GameCallbacks,
  info: WinInfo,
): void {
  const overlay = document.createElement('div');
  overlay.className =
    'fixed inset-0 z-[70] flex items-center justify-center bg-base-900/80 backdrop-blur-sm transition-all duration-300';

  const modal = document.createElement('div');
  modal.className =
    'flex flex-col items-center gap-4 p-8 rounded-3xl bg-base-800 ring-1 ring-base-700 shadow-2xl text-center';
  const trophy = icon(icons.trophy, 'w-14 h-14 text-amber-400');
  modal.appendChild(trophy);
  const h = document.createElement('h2');
  h.className = 'text-2xl font-semibold';
  h.textContent = 'Solved!';
  modal.appendChild(h);
  const p = document.createElement('p');
  p.className = 'text-slate-400 text-sm';
  p.textContent = 'Nicely done. Play again?';
  modal.appendChild(p);

  // Stats summary: shown per enabled setting.
  const { settings } = info;
  if (settings.timer || settings.score || settings.streak) {
    const statRow = document.createElement('div');
    statRow.className = 'flex flex-wrap items-stretch justify-center gap-3 mt-1';

    const stat = (
      iconNode: Parameters<typeof icon>[0],
      label: string,
      value: string,
      highlight = false,
    ) => {
      const cell = document.createElement('div');
      cell.className =
        'flex flex-col items-center gap-1 px-4 py-3 rounded-2xl bg-base-900/60 ring-1 ' +
        (highlight ? 'ring-amber-400/60' : 'ring-base-700') +
        ' min-w-[84px]';
      const top = document.createElement('div');
      top.className = 'flex items-center gap-1.5 text-slate-400 text-xs';
      top.appendChild(icon(iconNode, 'w-3.5 h-3.5'));
      top.appendChild(document.createTextNode(label));
      cell.appendChild(top);
      const val = document.createElement('span');
      val.className = 'text-lg font-semibold tabular-nums';
      val.textContent = value;
      cell.appendChild(val);
      if (highlight) {
        const pb = document.createElement('span');
        pb.className = 'text-[10px] font-semibold text-amber-400 -mt-1';
        pb.textContent = 'Best!';
        cell.appendChild(pb);
      }
      return cell;
    };

    if (settings.timer) {
      statRow.appendChild(stat(icons.timer, 'Time', formatTime(info.timeMs), info.newBestTime));
    }
    if (settings.score) {
      statRow.appendChild(
        stat(icons.score, 'Score', `${info.score}`, info.newBestScore),
      );
    }
    if (settings.streak) {
      statRow.appendChild(
        stat(icons.streak, 'Streak', `${info.stats.currentStreak}`),
      );
    }
    modal.appendChild(statRow);
  }

  // Confetti fires on show; kept so we can stop it if we leave early.
  const stopConfetti = burstConfetti();

  // A floating pill to restore the modal after viewing the finished image.
  const backPill = document.createElement('button');
  backPill.className =
    'fixed bottom-8 left-1/2 -translate-x-1/2 z-[75] flex items-center gap-2 px-6 py-3 rounded-full bg-base-800/90 ring-1 ring-base-600 shadow-2xl text-sm font-semibold backdrop-blur-sm hidden';
  backPill.appendChild(icon(icons.trophy, 'w-4 h-4 text-amber-400'));
  backPill.appendChild(document.createTextNode('Back to results'));

  const showModal = (visible: boolean) => {
    if (visible) {
      overlay.classList.remove('opacity-0', 'pointer-events-none');
      backPill.classList.add('hidden');
    } else {
      // Fade the whole overlay out so the completed board shows behind it.
      overlay.classList.add('opacity-0', 'pointer-events-none');
      backPill.classList.remove('hidden');
      animate(
        backPill,
        [
          { opacity: 0, transform: 'translate(-50%, 12px)' },
          { opacity: 1, transform: 'translate(-50%, 0)' },
        ],
        { duration: 260, easing: 'ease-out' },
      );
    }
  };
  backPill.addEventListener('click', () => showModal(true));

  const row = document.createElement('div');
  row.className = 'flex flex-wrap justify-center gap-3 mt-2';

  const viewImage = document.createElement('button');
  viewImage.className =
    'flex items-center gap-2 px-6 py-2.5 rounded-full bg-base-700 hover:bg-base-600 transition-colors font-medium';
  viewImage.appendChild(icon(icons.peek, 'w-4 h-4'));
  viewImage.appendChild(document.createTextNode('View image'));
  viewImage.addEventListener('click', () => showModal(false));
  row.appendChild(viewImage);

  const again = document.createElement('button');
  again.className =
    'flex items-center gap-2 px-6 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-base-900 font-semibold transition-colors';
  again.appendChild(icon(icons.restart, 'w-4 h-4'));
  again.appendChild(document.createTextNode('Play again'));
  again.addEventListener('click', () => {
    stopConfetti();
    overlay.remove();
    backPill.remove();
    board.destroy();
    cb.onRestart();
  });
  row.appendChild(again);

  const menu = document.createElement('button');
  menu.className =
    'flex items-center gap-2 px-6 py-2.5 rounded-full bg-base-700 hover:bg-base-600 transition-colors font-medium';
  menu.appendChild(icon(icons.back, 'w-4 h-4'));
  menu.appendChild(document.createTextNode('Menu'));
  menu.addEventListener('click', () => {
    stopConfetti();
    overlay.remove();
    backPill.remove();
    board.destroy();
    cb.onExit();
  });
  row.appendChild(menu);

  modal.appendChild(row);
  overlay.appendChild(modal);
  root.appendChild(overlay);
  root.appendChild(backPill);

  overlay.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: 200,
    easing: 'ease-out',
  });
  animate(
    modal,
    [
      { opacity: 0, transform: 'scale(0.8) translateY(12px)' },
      { opacity: 1, transform: 'scale(1) translateY(0)' },
    ],
    { duration: 380, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
  );
  animate(
    trophy,
    [
      { transform: 'scale(0) rotate(-25deg)' },
      { transform: 'scale(1) rotate(0deg)' },
    ],
    { duration: 500, delay: 120, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
  );
}
