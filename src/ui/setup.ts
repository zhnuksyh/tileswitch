import { icon, icons } from './icons';

// The setup screen: choose an image (default sample or upload your own), then
// start. Resolves via the onStart callback.

const SAMPLE_SRC = '/sample-puzzle.png';

export interface SetupResult {
  image: HTMLImageElement;
}

export function renderSetup(
  root: HTMLElement,
  onStart: (result: SetupResult) => void,
): void {
  let selectedImage: HTMLImageElement | null = null;

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
  sub.textContent = 'Swap the tiles to rebuild the picture.';
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

  // Start
  const startBtn = document.createElement('button');
  startBtn.className =
    'flex items-center gap-2 px-8 py-3 rounded-full bg-accent hover:bg-accent-hover text-base-900 font-semibold transition-colors shadow-lg shadow-accent/20';
  startBtn.appendChild(icon(icons.puzzle, 'w-5 h-5'));
  startBtn.appendChild(document.createTextNode('Start Puzzle'));
  startBtn.addEventListener('click', () => {
    if (!selectedImage) return;
    onStart({ image: selectedImage });
  });
  container.appendChild(startBtn);

  root.appendChild(container);
}
