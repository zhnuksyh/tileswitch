import { DIFFICULTIES } from '../puzzle/grid';
import type { Difficulty } from '../puzzle/grid';
import { icon, icons } from './icons';

// The setup screen: choose an image (default sample or upload your own) and a
// difficulty, then start. Resolves via the onStart callback.

const SAMPLE_SRC = '/sample-puzzle.png';

export interface SetupResult {
  image: HTMLImageElement;
  difficulty: Difficulty;
}

export function renderSetup(
  root: HTMLElement,
  onStart: (result: SetupResult) => void,
): void {
  let selectedImage: HTMLImageElement | null = null;
  let selectedDifficulty: Difficulty = DIFFICULTIES[1];

  root.innerHTML = '';

  const container = document.createElement('div');
  container.className =
    'min-h-screen w-full flex flex-col items-center justify-center gap-8 p-6';

  // Title
  const header = document.createElement('div');
  header.className = 'flex flex-col items-center gap-3 text-center';
  const titleRow = document.createElement('div');
  titleRow.className = 'flex items-center gap-3';
  titleRow.appendChild(icon(icons.puzzle, 'w-9 h-9 text-accent'));
  const h1 = document.createElement('h1');
  h1.className = 'text-4xl font-semibold tracking-tight';
  h1.textContent = 'Jigsaw Puzzle';
  titleRow.appendChild(h1);
  header.appendChild(titleRow);
  const sub = document.createElement('p');
  sub.className = 'text-slate-400 text-sm';
  sub.textContent = 'Turn any image into a puzzle. Pick one and play.';
  header.appendChild(sub);
  container.appendChild(header);

  // Image preview + picker
  const card = document.createElement('div');
  card.className =
    'flex flex-col items-center gap-5 p-6 rounded-3xl bg-base-800/60 ring-1 ring-base-700 w-full max-w-md';

  const preview = document.createElement('div');
  preview.className =
    'relative w-full aspect-video rounded-2xl overflow-hidden bg-base-900 ring-1 ring-base-700 flex items-center justify-center';
  const previewImg = document.createElement('img');
  previewImg.className = 'w-full h-full object-cover';
  previewImg.alt = 'Puzzle preview';
  preview.appendChild(previewImg);
  card.appendChild(preview);

  const loadImage = (src: string) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      selectedImage = img;
      previewImg.src = src;
    };
    img.src = src;
  };
  loadImage(SAMPLE_SRC);

  // Upload button
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.className = 'hidden';
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    loadImage(url);
  });

  const uploadBtn = document.createElement('button');
  uploadBtn.className =
    'flex items-center gap-2 px-5 py-2.5 rounded-full bg-base-700 hover:bg-base-600 transition-colors text-sm font-medium';
  uploadBtn.appendChild(icon(icons.upload, 'w-4 h-4'));
  uploadBtn.appendChild(document.createTextNode('Upload image'));
  uploadBtn.addEventListener('click', () => fileInput.click());
  card.appendChild(uploadBtn);
  card.appendChild(fileInput);

  container.appendChild(card);

  // Difficulty
  const diffWrap = document.createElement('div');
  diffWrap.className = 'flex flex-col items-center gap-3';
  const diffLabel = document.createElement('span');
  diffLabel.className = 'text-xs uppercase tracking-wider text-slate-500';
  diffLabel.textContent = 'Difficulty';
  diffWrap.appendChild(diffLabel);

  const diffRow = document.createElement('div');
  diffRow.className = 'flex gap-2';
  const diffButtons: HTMLButtonElement[] = [];
  const paint = () => {
    diffButtons.forEach((b, i) => {
      const active = DIFFICULTIES[i] === selectedDifficulty;
      b.className =
        'px-4 py-2 rounded-full text-sm font-medium transition-colors ' +
        (active
          ? 'bg-accent text-base-900'
          : 'bg-base-800 text-slate-300 hover:bg-base-700');
    });
  };
  DIFFICULTIES.forEach((d) => {
    const b = document.createElement('button');
    b.textContent = d.label;
    b.addEventListener('click', () => {
      selectedDifficulty = d;
      paint();
    });
    diffButtons.push(b);
    diffRow.appendChild(b);
  });
  paint();
  diffWrap.appendChild(diffRow);
  container.appendChild(diffWrap);

  // Start
  const startBtn = document.createElement('button');
  startBtn.className =
    'flex items-center gap-2 px-8 py-3 rounded-full bg-accent hover:bg-accent-hover text-base-900 font-semibold transition-colors shadow-lg shadow-accent/20';
  startBtn.appendChild(icon(icons.puzzle, 'w-5 h-5'));
  startBtn.appendChild(document.createTextNode('Start Puzzle'));
  startBtn.addEventListener('click', () => {
    if (!selectedImage) return;
    onStart({ image: selectedImage, difficulty: selectedDifficulty });
  });
  container.appendChild(startBtn);

  root.appendChild(container);
}
