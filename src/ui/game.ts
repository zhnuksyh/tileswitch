import { Board } from '../game/board';
import { computeGrid } from '../puzzle/grid';
import { icon, icons } from './icons';
import { isMuted, toggleMuted } from '../audio/sfx';
import { animate } from './motion';
import { burstConfetti } from './confetti';
import { loadSettings } from '../game/settings';
import { computeScore, recordSolve, breakStreak, loadStats } from '../game/stats';
import { getNote, setNote, NOTE_MAX_LEN } from '../library/notes';
import { recordSolved } from '../library/history';
import type { LibraryImage } from '../library/manifest';

// Hosts a running puzzle: header with progress + controls, the board itself,
// and a win overlay. Chooses a cell size that fits the viewport.

export interface GameContext {
  /** The library entry being played (for notes and the next-puzzle rotation). */
  entry: LibraryImage;
  /** The library pool to rotate through on 'Next puzzle'. */
  library: LibraryImage[];
  /** Difficulty label, recorded in history on solve. */
  difficultyLabel: string;
}

export interface GameCallbacks {
  onExit: () => void;
  onRestart: () => void;
  /** Advance to the next non-repeated library image at the same difficulty. */
  onNext: () => void;
}

/** mm:ss from milliseconds. */
function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

/** A small yes/no modal. Cancel just dismisses; confirm runs onConfirm. */
function confirmDialog(root: HTMLElement, opts: ConfirmOptions): void {
  const overlay = document.createElement('div');
  overlay.className =
    'fixed inset-0 z-[80] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm';

  const modal = document.createElement('div');
  modal.className =
    'flex flex-col gap-4 p-6 rounded-3xl bg-base-800 ring-1 ring-base-700 w-full max-w-sm text-center shadow-2xl';

  const h = document.createElement('h2');
  h.className = 'text-lg font-semibold';
  h.textContent = opts.title;
  modal.appendChild(h);

  const p = document.createElement('p');
  p.className = 'text-sm text-slate-400';
  p.textContent = opts.message;
  modal.appendChild(p);

  const row = document.createElement('div');
  row.className = 'flex gap-3 mt-1';

  const close = () => {
    const anim = animate(overlay, [{ opacity: 1 }, { opacity: 0 }], { duration: 150 });
    if (anim) anim.finished.then(() => overlay.remove());
    else overlay.remove();
  };

  const cancel = document.createElement('button');
  cancel.className =
    'flex-1 px-5 py-2.5 rounded-full bg-base-700 hover:bg-base-600 transition-colors font-medium';
  cancel.textContent = 'Keep playing';
  cancel.addEventListener('click', close);
  row.appendChild(cancel);

  const confirm = document.createElement('button');
  confirm.className =
    'flex-1 px-5 py-2.5 rounded-full bg-red-500 hover:bg-red-400 text-white font-semibold transition-colors';
  confirm.textContent = opts.confirmLabel;
  confirm.addEventListener('click', () => {
    close();
    opts.onConfirm();
  });
  row.appendChild(confirm);

  modal.appendChild(row);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.appendChild(modal);
  root.appendChild(overlay);

  animate(overlay, [{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
  animate(
    modal,
    [
      { opacity: 0, transform: 'scale(0.95) translateY(8px)' },
      { opacity: 1, transform: 'scale(1) translateY(0)' },
    ],
    { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  );
}

export function renderGame(
  root: HTMLElement,
  image: HTMLImageElement,
  baseTiles: number,
  cb: GameCallbacks,
  ctx: GameContext,
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
  container.className = 'min-h-screen w-full flex flex-col items-center';

  // Board dimensions drive the header width: the controls' outer edges line up
  // with the board's left/right edges rather than the full viewport, pulling
  // them toward centre over the puzzle. We reference a 16:9 width so narrow
  // (portrait) puzzles still get a comfortable, not-too-cramped control bar.
  const boardW = grid.cols * safeCell;
  const ref169 = Math.round((maxBoardH * 16) / 9);
  const headerMax = Math.min(
    Math.max(boardW, Math.min(ref169, maxBoardW)),
    maxBoardW,
  );

  // Header. Menu sits alone on the left; everything else (stats + controls)
  // groups on the right. No divider under it. Width matches the board so the
  // controls sit at its edges.
  const header = document.createElement('header');
  header.className = 'flex items-center justify-between gap-4 px-1 w-full';
  header.style.maxWidth = `${headerMax}px`;

  const backBtn = document.createElement('button');
  backBtn.className =
    'flex items-center gap-2 px-4 py-2 rounded-full bg-base-800 hover:bg-base-700 transition-colors text-sm font-medium';
  backBtn.appendChild(icon(icons.back, 'w-4 h-4'));
  backBtn.appendChild(document.createTextNode('Menu'));
  // Confirm-on-exit is wired below (needs `board`); handler set after it exists.
  header.appendChild(backBtn);

  // Right group: stat chips followed by icon-only controls.
  const rightControls = document.createElement('div');
  rightControls.className = 'flex items-center gap-2';

  // Progress chip (always shown): grid icon + "placed / total".
  const progressChip = document.createElement('div');
  progressChip.className =
    'flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-base-800 text-sm font-medium tabular-nums text-slate-200';
  progressChip.appendChild(icon(icons.progress, 'w-3.5 h-3.5 text-slate-400'));
  progressChip.title = 'Tiles placed correctly';
  const progress = document.createElement('span');
  progressChip.appendChild(progress);
  rightControls.appendChild(progressChip);

  // Live timer chip (only when enabled).
  const timerChip = document.createElement('div');
  timerChip.className =
    'flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-base-800 text-sm font-medium tabular-nums text-slate-200';
  timerChip.appendChild(icon(icons.timer, 'w-3.5 h-3.5 text-slate-400'));
  const timerText = document.createElement('span');
  timerText.textContent = '0:00';
  timerChip.appendChild(timerText);
  if (settings.timer) rightControls.appendChild(timerChip);

  // Streak chip (only when enabled; visible once a streak exists).
  const streakChip = document.createElement('div');
  streakChip.className =
    'flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 text-sm font-medium tabular-nums text-amber-300';
  streakChip.appendChild(icon(icons.streak, 'w-3.5 h-3.5'));
  const streakText = document.createElement('span');
  streakChip.appendChild(streakText);
  const refreshStreakChip = () => {
    const cur = loadStats().currentStreak;
    streakText.textContent = `${cur}`;
    streakChip.classList.toggle('hidden', !(settings.streak && cur > 0));
  };
  refreshStreakChip();
  if (settings.streak) rightControls.appendChild(streakChip);

  // A thin spacer so chips and control buttons read as two groups.
  const spacer = document.createElement('div');
  spacer.className = 'w-px h-6 bg-base-700/70 mx-1';
  rightControls.appendChild(spacer);

  // Icon-only control button factory.
  const iconBtn = (label: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.className =
      'flex items-center justify-center w-10 h-10 rounded-full bg-base-800 hover:bg-base-700 transition-colors';
    b.setAttribute('aria-label', label);
    b.title = label;
    return b;
  };

  // Mute toggle. Icon reflects current state; click flips and persists it.
  const muteBtn = iconBtn('Toggle sound');
  const renderMuteIcon = () => {
    muteBtn.innerHTML = '';
    muteBtn.appendChild(icon(isMuted() ? icons.soundOff : icons.soundOn, 'w-4 h-4'));
    muteBtn.title = isMuted() ? 'Sound off' : 'Sound on';
  };
  renderMuteIcon();
  muteBtn.addEventListener('click', () => {
    toggleMuted();
    renderMuteIcon();
    animate(muteBtn, [{ transform: 'scale(0.85)' }, { transform: 'scale(1)' }], {
      duration: 180,
      easing: 'ease-out',
    });
  });
  rightControls.appendChild(muteBtn);

  // Peek: briefly reveal the completed image over the board as a hint.
  const peekBtn = iconBtn('Peek at the full image');
  peekBtn.appendChild(icon(icons.peek, 'w-4 h-4'));
  peekBtn.addEventListener('click', () => {
    board.peek();
    animate(peekBtn, [{ transform: 'scale(0.9)' }, { transform: 'scale(1)' }], {
      duration: 180,
      easing: 'ease-out',
    });
  });
  rightControls.appendChild(peekBtn);

  // Restart.
  const restartBtn = iconBtn('Restart puzzle');
  restartBtn.appendChild(icon(icons.restart, 'w-4 h-4'));
  restartBtn.addEventListener('click', () => {
    board.destroy();
    cb.onRestart();
  });
  rightControls.appendChild(restartBtn);

  header.appendChild(rightControls);

  // Stage: header + board grouped and centred together, so the controls sit
  // just above the puzzle rather than pinned to the top of the screen. Scrolls
  // as one unit when a fine grid is taller than the viewport.
  const stage = document.createElement('div');
  stage.className =
    'flex-1 w-full flex flex-col items-center justify-center gap-1.5 overflow-auto p-4';
  stage.appendChild(header);

  const boardCenter = document.createElement('div');
  stage.appendChild(boardCenter);
  container.appendChild(stage);

  root.appendChild(container);

  const stopTimer = () => {
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = null;
    }
  };

  const board = new Board(boardCenter, image, grid, safeCell, {
    onProgress: (correct, total) => {
      progress.textContent = `${correct} / ${total}`;
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
      // Stamp this image's history entry with the solve time + difficulty.
      recordSolved(ctx.entry.id, elapsedMs, ctx.difficultyLabel);
      showWin(root, board, cb, {
        settings,
        timeMs: elapsedMs,
        moves,
        score,
        stats,
        newBestScore,
        newBestTime,
        entry: ctx.entry,
        canAdvance: ctx.library.length > 1,
      });
    },
  });

  // Leaving to the menu mid-solve abandons the puzzle (and breaks the streak),
  // so confirm first when the puzzle isn't done.
  const leaveToMenu = () => {
    stopTimer();
    if (!finished && settings.streak) breakStreak();
    board.destroy();
    cb.onExit();
  };
  backBtn.addEventListener('click', () => {
    if (finished || board.progress === 0) {
      leaveToMenu();
      return;
    }
    confirmDialog(root, {
      title: 'Leave this puzzle?',
      message: settings.streak
        ? 'Your progress will be lost and your win streak will reset.'
        : 'Your progress on this puzzle will be lost.',
      confirmLabel: 'Leave',
      onConfirm: leaveToMenu,
    });
  });

  // Restarting also breaks the streak (a fresh attempt), but no confirm.
  restartBtn.addEventListener('click', () => {
    if (!finished && settings.streak) breakStreak();
  });

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
  /** The image just solved, for the note field. */
  entry: LibraryImage;
  /** Whether a next-puzzle image is available to advance to. */
  canAdvance: boolean;
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

  // Optional note for this image — saved live as you type, read later in
  // History. One note per image (re-solving edits the same note).
  const noteWrap = document.createElement('div');
  noteWrap.className = 'w-full flex flex-col gap-1.5 mt-1 text-left';
  const noteLabel = document.createElement('label');
  noteLabel.className = 'flex items-center gap-1.5 text-xs font-medium text-slate-400';
  noteLabel.appendChild(icon(icons.note, 'w-3.5 h-3.5'));
  noteLabel.appendChild(document.createTextNode('Add a note (saved to this image)'));
  noteWrap.appendChild(noteLabel);
  const noteInput = document.createElement('textarea');
  noteInput.className =
    'w-full resize-none rounded-2xl bg-base-900/70 ring-1 ring-base-700 focus:ring-accent outline-none px-4 py-3 text-sm placeholder:text-slate-600 transition-shadow';
  noteInput.rows = 2;
  noteInput.maxLength = NOTE_MAX_LEN;
  noteInput.placeholder = 'How was this one? A memory, a caption…';
  noteInput.value = getNote(info.entry.id);
  noteInput.addEventListener('input', () => setNote(info.entry.id, noteInput.value));
  noteWrap.appendChild(noteInput);
  modal.appendChild(noteWrap);

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
    'flex items-center gap-2 px-6 py-2.5 rounded-full bg-base-700 hover:bg-base-600 transition-colors font-medium';
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

  // Next puzzle: rotate to the next non-repeated library image, same
  // difficulty. Primary action when there's more than one image to rotate.
  if (info.canAdvance) {
    const next = document.createElement('button');
    next.className =
      'flex items-center gap-2 px-6 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-base-900 font-semibold transition-colors';
    next.appendChild(document.createTextNode('Next puzzle'));
    next.appendChild(icon(icons.next, 'w-4 h-4'));
    next.addEventListener('click', () => {
      stopConfetti();
      overlay.remove();
      backPill.remove();
      board.destroy();
      cb.onNext();
    });
    row.appendChild(next);
  }

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
