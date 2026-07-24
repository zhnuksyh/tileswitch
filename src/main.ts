import './style.css';
import { renderSetup } from './ui/setup';
import { renderGame } from './ui/game';
import type { SetupResult } from './ui/setup';
import { initAudio } from './audio/sfx';
import { initBackground } from './library/background';
import { nextImage } from './library/rotation';
import { recordPlayed } from './library/history';

// App shell: toggles between the setup screen and a running game.

const app = document.getElementById('app');
if (!app) throw new Error('#app not found');

// Unlock audio on the first user gesture (browser autoplay policy).
initAudio();

// Apply the saved custom background (if any) behind the app.
void initBackground();

function showSetup(): void {
  renderSetup(app!, (result) => {
    startGame(result);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image.'));
    img.src = src;
  });
}

// Advance to the next non-repeated library image at the same difficulty.
async function playNext(setup: SetupResult): Promise<void> {
  const entry = nextImage(setup.library, setup.entry.id);
  if (!entry) {
    showSetup();
    return;
  }
  try {
    const image = await loadImage(entry.src);
    recordPlayed(entry);
    startGame({ ...setup, image, entry });
  } catch {
    // Image gone (e.g. deleted upload) — fall back to the menu.
    showSetup();
  }
}

function startGame(setup: SetupResult): void {
  renderGame(
    app!,
    setup.image,
    setup.baseTiles,
    {
      onExit: showSetup,
      onRestart: () => startGame(setup),
      onNext: () => void playNext(setup),
    },
    {
      entry: setup.entry,
      library: setup.library,
      difficultyLabel: setup.difficultyLabel,
    },
  );
}

showSetup();
