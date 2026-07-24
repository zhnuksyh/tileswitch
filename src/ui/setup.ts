import { icon, icons } from './icons';
import { getLibrary, hasPersonalLibrary, type LibraryImage } from '../library/manifest';
import { addUpload, removeUpload } from '../library/uploads';
import { nextImage, markSeen } from '../library/rotation';
import { play } from '../audio/sfx';
import { animate } from './motion';
import { DIFFICULTIES, DEFAULT_DIFFICULTY } from '../game/difficulty';

// The setup screen: your library is one shuffle pool (personal images from
// /my-library, or public placeholders when that's empty, plus anything you've
// dragged in). Hand-pick a thumbnail or hit Shuffle for the next non-repeated
// image, choose a difficulty, then start.

export interface SetupResult {
  image: HTMLImageElement;
  /** Tiles along the image's shorter side — higher is harder. */
  baseTiles: number;
}

export function renderSetup(
  root: HTMLElement,
  onStart: (result: SetupResult) => void,
): void {
  let selectedImage: HTMLImageElement | null = null;
  let selectedId: string | null = null;
  let selectedDifficulty = DEFAULT_DIFFICULTY;
  let library: LibraryImage[] = getLibrary();

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
  previewHint.textContent = 'Shuffle or pick an image to preview';
  preview.appendChild(previewHint);
  card.appendChild(preview);

  const enableStart = () => {
    startBtn.disabled = false;
    startBtn.classList.remove('opacity-50', 'pointer-events-none');
  };

  // Load an image by library entry: sets it as the selection and previews it.
  const selectImage = (entry: LibraryImage, options: { count?: boolean } = {}) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      selectedImage = img;
      selectedId = entry.id;
      previewImg.src = entry.src;
      previewHint.classList.add('hidden');
      enableStart();
      if (options.count) markSeen(library, entry.id);
      refreshSelection();
      play('select');
      animate(
        previewImg,
        [{ opacity: 0.3, transform: 'scale(1.03)' }, { opacity: 1, transform: 'scale(1)' }],
        { duration: 260, easing: 'ease-out' },
      );
    };
    img.src = entry.src;
  };

  // --- Shuffle bar -----------------------------------------------------------
  const shuffleRow = document.createElement('div');
  shuffleRow.className = 'flex items-center gap-3';

  const shuffleBtn = document.createElement('button');
  shuffleBtn.className =
    'flex items-center gap-2 px-5 py-2.5 rounded-full bg-base-700 hover:bg-base-600 transition-colors text-sm font-semibold disabled:opacity-40 disabled:pointer-events-none';
  shuffleBtn.appendChild(icon(icons.shuffle, 'w-4 h-4'));
  shuffleBtn.appendChild(document.createTextNode('Shuffle'));
  shuffleBtn.addEventListener('click', () => {
    const entry = nextImage(library, selectedId ?? undefined);
    if (!entry) return;
    selectImage(entry, { count: true });
  });
  shuffleRow.appendChild(shuffleBtn);

  const shuffleHint = document.createElement('span');
  shuffleHint.className = 'text-xs text-slate-500';
  shuffleRow.appendChild(shuffleHint);
  card.appendChild(shuffleRow);

  // --- Library grid ----------------------------------------------------------
  const thumbButtons = new Map<string, HTMLButtonElement>();

  const refreshSelection = () => {
    for (const [id, btn] of thumbButtons) {
      btn.className = thumbClass(id === selectedId);
    }
  };

  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-3 gap-3';
  card.appendChild(grid);

  const sourceNote = document.createElement('p');
  sourceNote.className = 'text-[11px] text-slate-500';
  card.appendChild(sourceNote);

  const renderGrid = () => {
    grid.innerHTML = '';
    thumbButtons.clear();
    for (const image of library) {
      grid.appendChild(
        renderThumb(image, selectImage, thumbButtons, (id) => {
          removeUpload(id);
          refreshLibrary();
        }),
      );
    }
    refreshSelection();

    const uploads = library.filter((i) => i.source === 'uploaded').length;
    shuffleHint.textContent = library.length
      ? `${library.length} in rotation`
      : 'No images yet — add some below';
    shuffleBtn.disabled = library.length === 0;
    sourceNote.textContent = hasPersonalLibrary
      ? `Your library (/my-library)${uploads ? ` + ${uploads} added here` : ''}`
      : `Public placeholders${uploads ? ` + ${uploads} you added` : ''} — drop images in /my-library to make it yours`;
  };

  // Re-read the pool after uploads change, keeping the current selection valid.
  const refreshLibrary = () => {
    library = getLibrary();
    if (selectedId && !library.some((i) => i.id === selectedId)) {
      selectedId = null;
      selectedImage = null;
      previewImg.removeAttribute('src');
      previewHint.classList.remove('hidden');
      startBtn.disabled = true;
      startBtn.classList.add('opacity-50', 'pointer-events-none');
    }
    renderGrid();
  };

  // --- Add images (drag-drop + file select) ---------------------------------
  const addZone = renderAddZone(async (files) => {
    let firstAdded: LibraryImage | null = null;
    for (const file of files) {
      try {
        const up = await addUpload(file);
        if (!firstAdded) {
          firstAdded = { id: up.id, title: up.title, src: up.dataUrl, source: 'uploaded' };
        }
      } catch (err) {
        console.warn('Skipped a file:', err);
      }
    }
    refreshLibrary();
    if (firstAdded) selectImage(firstAdded);
  });
  card.appendChild(addZone);

  // Difficulty selector: sets how fine the tile grid is.
  const diffSection = document.createElement('div');
  diffSection.className = 'flex flex-col gap-2 pt-1';
  const diffLabel = document.createElement('span');
  diffLabel.className = 'text-xs font-medium text-slate-400';
  diffLabel.textContent = 'Difficulty';
  diffSection.appendChild(diffLabel);

  const diffRow = document.createElement('div');
  diffRow.className = 'grid grid-cols-4 gap-2';
  const diffButtons = new Map<string, HTMLButtonElement>();
  const refreshDifficulty = () => {
    for (const [id, btn] of diffButtons) {
      btn.className = diffClass(id === selectedDifficulty.id);
    }
  };
  for (const diff of DIFFICULTIES) {
    const btn = document.createElement('button');
    btn.className = diffClass(diff.id === selectedDifficulty.id);
    const name = document.createElement('span');
    name.className = 'text-sm font-semibold';
    name.textContent = diff.label;
    const hint = document.createElement('span');
    hint.className = 'text-[11px] opacity-70 tabular-nums';
    hint.textContent = diff.hint;
    btn.appendChild(name);
    btn.appendChild(hint);
    btn.addEventListener('click', () => {
      selectedDifficulty = diff;
      refreshDifficulty();
      play('select');
    });
    diffButtons.set(diff.id, btn);
    diffRow.appendChild(btn);
  }
  diffSection.appendChild(diffRow);
  card.appendChild(diffSection);

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
    onStart({
      image: selectedImage,
      baseTiles: selectedDifficulty.baseTiles,
    });
  });
  container.appendChild(startBtn);

  root.appendChild(container);

  renderGrid();

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

function diffClass(active: boolean): string {
  const base =
    'flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-xl transition-colors';
  return active
    ? `${base} bg-accent text-base-900`
    : `${base} bg-base-700 hover:bg-base-600 text-slate-200`;
}

function thumbClass(selected: boolean): string {
  const base =
    'relative aspect-video rounded-xl overflow-hidden bg-base-900 ring-1 transition-all group';
  return selected
    ? `${base} ring-2 ring-accent`
    : `${base} ring-base-700 hover:ring-base-500`;
}

function renderThumb(
  image: LibraryImage,
  onPick: (image: LibraryImage) => void,
  registry: Map<string, HTMLButtonElement>,
  onRemove: (id: string) => void,
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

  // Uploaded images can be removed.
  if (image.source === 'uploaded') {
    const del = document.createElement('span');
    del.className =
      'absolute top-1 right-1 grid place-items-center w-6 h-6 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-opacity';
    del.setAttribute('role', 'button');
    del.title = 'Remove';
    del.appendChild(icon(icons.trash, 'w-3.5 h-3.5'));
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      play('select');
      onRemove(image.id);
    });
    btn.appendChild(del);
  }

  btn.addEventListener('click', () => onPick(image));
  registry.set(image.id, btn);
  return btn;
}

// Drag-and-drop zone with a file-select fallback. Calls back with picked files.
function renderAddZone(
  onFiles: (files: File[]) => void,
): HTMLElement {
  const zone = document.createElement('div');
  zone.className =
    'flex flex-col items-center gap-2 py-5 px-4 rounded-2xl border-2 border-dashed border-base-700 text-center transition-colors';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.multiple = true;
  fileInput.className = 'hidden';
  fileInput.addEventListener('change', () => {
    const files = fileInput.files ? Array.from(fileInput.files) : [];
    if (files.length) onFiles(files);
    fileInput.value = '';
  });

  const iconWrap = icon(icons.upload, 'w-6 h-6 text-slate-400');
  zone.appendChild(iconWrap);

  const chooseBtn = document.createElement('button');
  chooseBtn.className =
    'flex items-center gap-2 px-5 py-2 rounded-full bg-base-700 hover:bg-base-600 transition-colors text-sm font-medium';
  chooseBtn.appendChild(document.createTextNode('Choose images'));
  chooseBtn.addEventListener('click', () => fileInput.click());
  zone.appendChild(chooseBtn);
  zone.appendChild(fileInput);

  const hint = document.createElement('p');
  hint.className = 'text-slate-500 text-xs';
  hint.textContent = 'or drag & drop here — saved to your library on this device';
  zone.appendChild(hint);

  // Drag styling + drop handling.
  const highlight = (on: boolean) => {
    zone.classList.toggle('border-accent', on);
    zone.classList.toggle('bg-accent/5', on);
  };
  ['dragenter', 'dragover'].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      highlight(true);
    }),
  );
  ['dragleave', 'dragend'].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      highlight(false);
    }),
  );
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    highlight(false);
    const dt = (e as DragEvent).dataTransfer;
    if (!dt) return;
    const files = Array.from(dt.files).filter((f) => f.type.startsWith('image/'));
    if (files.length) onFiles(files);
  });

  return zone;
}
