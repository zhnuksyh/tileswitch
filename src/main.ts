import './style.css';
import { renderSetup } from './ui/setup';
import { renderGame } from './ui/game';
import type { SetupResult } from './ui/setup';
import { initAudio } from './audio/sfx';

// App shell: toggles between the setup screen and a running game.

const app = document.getElementById('app');
if (!app) throw new Error('#app not found');

// Unlock audio on the first user gesture (browser autoplay policy).
initAudio();

let lastSetup: SetupResult | null = null;

function showSetup(): void {
  renderSetup(app!, (result) => {
    lastSetup = result;
    startGame(result);
  });
}

function startGame(setup: SetupResult): void {
  renderGame(app!, setup.image, {
    onExit: showSetup,
    onRestart: () => {
      if (lastSetup) startGame(lastSetup);
    },
  });
}

showSetup();
