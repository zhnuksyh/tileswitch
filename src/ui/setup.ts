import { icon, icons } from './icons';
import { categories, type LibraryImage } from '../library/manifest';
import { play } from '../audio/sfx';
import { animate } from './motion';

// The setup screen: pick an image from the built-in library (organized into
// category tabs) or upload your own, then start. Resolves via the onStart
// callback with the chosen image.

export interface SetupResult {
  image: HTMLImageElement;
}

type TabId = string; // category id, or 'upload'

export function renderSetup(
  root: HTMLElement,
  onStart: (result: SetupResult) => void,
): void {
  let selectedImage: HTMLImageElement | null = null;
  let selectedSrc: string | null = null;

  root.innerHTML = '';

  const container = document.createElement('div');
  container.className =
    'min-h-screen w-full flex flex-col items-center justify-center gap-6 p-6';

  // Title
  const header = document.createElement('div');
  header.className = 'flex flex-col items-center gap-3 text-center';
  const titleRow = document.createElement('div');
  titleRow.className = 'flex items-center gap-3';
  titleRow.appendChild(icon(icons.puzzle, 'w-9 h-9 text-accent'));
  const h1 = document.createElement('h1');
  h1.className = 'text-4xl font-semibold tracking-tight';
  h1.textContent = 'TileSwitch';
  titleRow.appendChild(h1);
  header.appendChild(titleRow);
  const sub = document.createElement('p');
  sub.className = 'text-slate-400 text-sm';
  sub.textContent = 'Swap the tiles to rebuild the picture.';
  header.appendChild(sub);
  container.appendChild(header);

  const card = document.createElement('div');
  card.className =
    'flex flex-col gap-5 p-6 rounded-3xl bg-base-800/60 ring-1 ring-base-700 w-full max-w-xl';

  // Shared preview
  const preview = document.createElement('div');
  preview.className =
    'relative w-full aspect-video rounded-2xl overflow-hidden bg-base-900 ring-1 ring-base-700 flex items-center justify-center';
  const previewImg = document.createElement('img');
  previewImg.className = 'w-full h-full object-cover';
  previewImg.alt = 'Puzzle preview';
  preview.appendChild(previewImg);
  const previewHint = document.createElement('span');
  previewHint.className = 'absolute text-slate-500 text-sm';
  previewHint.textContent = 'Pick an image to preview';
  preview.appendChild(previewHint);
  card.appendChild(preview);

  const loadImage = (src: string) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      selectedImage = img;
      selectedSrc = src;
      previewImg.src = src;
      previewHint.classList.add('hidden');
      startBtn.disabled = false;
      startBtn.classList.remove('opacity-50', 'pointer-events-none');
      refreshSelection();
      play('select');
      animate(
        previewImg,
        [{ opacity: 0.3, transform: 'scale(1.03)' }, { opacity: 1, transform: 'scale(1)' }],
        { duration: 260, easing: 'ease-out' },
      );
    };
    img.src = src;
  };

  // Tab strip: one per category, plus Upload.
  const tabs: { id: TabId; label: string }[] = [
    ...categories.map((c) => ({ id: c.id, label: c.label })),
    { id: 'upload', label: 'Upload' },
  ];
  let activeTab: TabId = tabs[0].id;

  const tabRow = document.createElement('div');
  tabRow.className = 'flex flex-wrap gap-2';
  const tabButtons = new Map<TabId, HTMLButtonElement>();
  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.className = tabClass(false);
    btn.textContent = tab.label;
    btn.addEventListener('click', () => {
      activeTab = tab.id;
      refreshTabs();
      renderBody();
    });
    tabButtons.set(tab.id, btn);
    tabRow.appendChild(btn);
  }
  card.appendChild(tabRow);

  const refreshTabs = () => {
    for (const [id, btn] of tabButtons) {
      btn.className = tabClass(id === activeTab);
    }
  };

  // Body area (swaps per tab).
  const body = document.createElement('div');
  card.appendChild(body);

  // Track thumbnail buttons so we can move the selection ring.
  const thumbButtons = new Map<string, HTMLButtonElement>();

  const refreshSelection = () => {
    for (const [src, btn] of thumbButtons) {
      btn.className = thumbClass(src === selectedSrc);
    }
  };

  const renderBody = () => {
    body.innerHTML = '';
    thumbButtons.clear();

    if (activeTab === 'upload') {
      renderUpload(body, loadImage);
      return;
    }
    const category = categories.find((c) => c.id === activeTab);
    if (!category) return;

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-3 gap-3';
    for (const image of category.images) {
      grid.appendChild(renderThumb(image, loadImage, thumbButtons));
    }
    body.appendChild(grid);
    refreshSelection();
  };

  container.appendChild(card);

  // Start
  const startBtn = document.createElement('button');
  startBtn.className =
    'flex items-center gap-2 px-8 py-3 rounded-full bg-accent hover:bg-accent-hover text-base-900 font-semibold transition-colors shadow-lg shadow-accent/20 opacity-50 pointer-events-none';
  startBtn.disabled = true;
  startBtn.appendChild(icon(icons.puzzle, 'w-5 h-5'));
  startBtn.appendChild(document.createTextNode('Start Puzzle'));
  startBtn.addEventListener('click', () => {
    if (!selectedImage) return;
    onStart({ image: selectedImage });
  });
  container.appendChild(startBtn);

  root.appendChild(container);

  refreshTabs();
  renderBody();

  // Gentle entrance for the whole setup.
  animate(
    container,
    [
      { opacity: 0, transform: 'translateY(10px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    { duration: 360, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  );
}

function tabClass(active: boolean): string {
  const base =
    'px-4 py-1.5 rounded-full text-sm font-medium transition-colors';
  return active
    ? `${base} bg-accent text-base-900`
    : `${base} bg-base-700 hover:bg-base-600 text-slate-200`;
}

function thumbClass(selected: boolean): string {
  const base =
    'relative aspect-video rounded-xl overflow-hidden bg-base-900 ring-1 transition-all';
  return selected
    ? `${base} ring-2 ring-accent`
    : `${base} ring-base-700 hover:ring-base-500`;
}

function renderThumb(
  image: LibraryImage,
  onPick: (src: string) => void,
  registry: Map<string, HTMLButtonElement>,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = thumbClass(false);
  btn.title = image.title;

  const thumbImg = document.createElement('img');
  thumbImg.className = 'w-full h-full object-cover';
  thumbImg.loading = 'lazy';
  thumbImg.alt = image.title;
  thumbImg.src = image.src;
  btn.appendChild(thumbImg);

  const label = document.createElement('span');
  label.className =
    'absolute inset-x-0 bottom-0 px-2 py-1 text-[11px] font-medium text-white text-left bg-gradient-to-t from-black/70 to-transparent truncate';
  label.textContent = image.title;
  btn.appendChild(label);

  btn.addEventListener('click', () => onPick(image.src));
  registry.set(image.src, btn);
  return btn;
}

function renderUpload(
  body: HTMLElement,
  onPick: (src: string) => void,
): void {
  const wrap = document.createElement('div');
  wrap.className = 'flex flex-col items-center gap-3 py-4';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.className = 'hidden';
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    onPick(URL.createObjectURL(file));
  });

  const uploadBtn = document.createElement('button');
  uploadBtn.className =
    'flex items-center gap-2 px-5 py-2.5 rounded-full bg-base-700 hover:bg-base-600 transition-colors text-sm font-medium';
  uploadBtn.appendChild(icon(icons.upload, 'w-4 h-4'));
  uploadBtn.appendChild(document.createTextNode('Choose image'));
  uploadBtn.addEventListener('click', () => fileInput.click());

  const hint = document.createElement('p');
  hint.className = 'text-slate-500 text-xs';
  hint.textContent = 'Any picture from your device works.';

  wrap.appendChild(uploadBtn);
  wrap.appendChild(fileInput);
  wrap.appendChild(hint);
  body.appendChild(wrap);
}
