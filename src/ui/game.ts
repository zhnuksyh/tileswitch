import { Board } from '../game/board';
import { computeGrid } from '../puzzle/grid';
import { icon, icons } from './icons';
import { isMuted, toggleMuted } from '../audio/sfx';
import { animate } from './motion';

// Hosts a running puzzle: header with progress + controls, the board itself,
// and a win overlay. Chooses a cell size that fits the viewport.

export interface GameCallbacks {
  onExit: () => void;
  onRestart: () => void;
}

export function renderGame(
  root: HTMLElement,
  image: HTMLImageElement,
  cb: GameCallbacks,
): void {
  root.innerHTML = '';

  const grid = computeGrid(image.naturalWidth, image.naturalHeight);

  // Fit the grid within the viewport, leaving room for the header.
  const maxBoardW = Math.min(window.innerWidth - 48, 900);
  const maxBoardH = window.innerHeight * 0.75;
  const cellSize = Math.floor(
    Math.min(maxBoardW / grid.cols, maxBoardH / grid.rows),
  );
  const safeCell = Math.max(48, cellSize);

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

  const progress = document.createElement('div');
  progress.className = 'text-sm font-medium text-slate-300 tabular-nums';
  header.appendChild(progress);

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

  // Board area
  const boardArea = document.createElement('div');
  boardArea.className = 'flex-1 flex items-center justify-center p-4 overflow-auto';
  container.appendChild(boardArea);

  root.appendChild(container);

  const board = new Board(boardArea, image, grid, safeCell, {
    onProgress: (correct, total) => {
      progress.textContent = `${correct} / ${total} in place`;
    },
    onWin: () => showWin(root, board, cb),
  });
}

function showWin(root: HTMLElement, board: Board, cb: GameCallbacks): void {
  const overlay = document.createElement('div');
  overlay.className =
    'fixed inset-0 z-[70] flex items-center justify-center bg-base-900/80 backdrop-blur-sm';

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

  const row = document.createElement('div');
  row.className = 'flex gap-3 mt-2';

  const again = document.createElement('button');
  again.className =
    'flex items-center gap-2 px-6 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-base-900 font-semibold transition-colors';
  again.appendChild(icon(icons.restart, 'w-4 h-4'));
  again.appendChild(document.createTextNode('Play again'));
  again.addEventListener('click', () => {
    overlay.remove();
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
    overlay.remove();
    board.destroy();
    cb.onExit();
  });
  row.appendChild(menu);

  modal.appendChild(row);
  overlay.appendChild(modal);
  root.appendChild(overlay);

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
