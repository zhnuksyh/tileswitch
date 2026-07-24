import { icon, icons } from './icons';
import { getLibrary, type LibraryImage } from '../library/manifest';
import { addUploads, removeUpload } from '../library/uploads';
import { nextImage, markSeen } from '../library/rotation';
import { setBackground, clearBackground, hasBackground } from '../library/background';
import { play } from '../audio/sfx';
import { animate } from './motion';
import { DIFFICULTIES, DEFAULT_DIFFICULTY } from '../game/difficulty';
import { loadSettings, saveSettings, type Settings } from '../game/settings';
import { loadStats } from '../game/stats';

// The setup screen: your library is one shuffle pool — the public starter set
// until you add your own images (drag-drop / file-select, saved to this device).
// Hand-pick a thumbnail or hit Shuffle for the next non-repeated image, choose a
// difficulty, then start.

export interface SetupResult {
  image: HTMLImageElement;
  /** Tiles along the image's shorter side — higher is harder. */
  baseTiles: number;
}

// Cap on how many images the user's library can hold. IndexedDB could store far
// more (hundreds of MB → ~1000+ compressed 1080p images), so this is a UI/sanity
// limit, not a storage one — it keeps the thumbnail grid and shuffle manageable.
// At ~1 MB per WebP-encoded 16:9 image, 60 images is ~60 MB, well within quota.
const MAX_LIBRARY_IMAGES = 60;

export function renderSetup(
  root: HTMLElement,
  onStart: (result: SetupResult) => void,
): void {
  let selectedImage: HTMLImageElement | null = null;
  let selectedId: string | null = null;
  let selectedDifficulty = DEFAULT_DIFFICULTY;
  let library: LibraryImage[] = [];

  root.innerHTML = '';

  const container = document.createElement('div');
  container.className =
    'min-h-screen w-full flex flex-col items-center gap-6 p-4 sm:p-6 lg:justify-center';

  // Settings gear, pinned top-right — opens the gameplay toggles panel.
  const gearBtn = document.createElement('button');
  gearBtn.className =
    'fixed top-4 right-4 z-40 flex items-center justify-center w-11 h-11 rounded-full bg-base-800 hover:bg-base-700 ring-1 ring-base-700 transition-colors';
  gearBtn.setAttribute('aria-label', 'Settings');
  gearBtn.title = 'Settings';
  gearBtn.appendChild(icon(icons.settings, 'w-5 h-5'));
  gearBtn.addEventListener('click', () => showSettings(container));
  container.appendChild(gearBtn);

  // Title
  const header = document.createElement('div');
  header.className = 'flex flex-col items-center gap-2 text-center pt-6 lg:pt-0';
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

  // Two-row, two-column shell. Each row is its own grid with `items-stretch`
  // so the left and right cards in a row share the same height — their top and
  // bottom edges line up on the same lines for a clean, aligned look. On mobile
  // everything collapses to a single stacked column.
  //   Row 1: preview  (left)  ·  library grid (right)
  //   Row 2: upload    (left)  ·  difficulty + start (right)
  const layout = document.createElement('div');
  layout.className = 'w-full max-w-5xl flex flex-col gap-5';
  container.appendChild(layout);

  const row1 = document.createElement('div');
  row1.className = 'grid grid-cols-1 lg:grid-cols-2 gap-5 lg:items-stretch';
  layout.appendChild(row1);

  const row2 = document.createElement('div');
  row2.className = 'grid grid-cols-1 lg:grid-cols-2 gap-5 lg:items-stretch';
  layout.appendChild(row2);

  // ==== Row 1 left: preview carousel =======================================
  const previewCard = document.createElement('div');
  previewCard.className =
    'flex flex-col p-5 rounded-3xl bg-base-800/60 ring-1 ring-base-700';

  // Preview frame. The image fills the card, so a taller card (matched to the
  // grid's height) still crops cleanly.
  const preview = document.createElement('div');
  preview.className =
    'relative w-full flex-1 min-h-[12rem] aspect-video lg:aspect-auto rounded-2xl overflow-hidden bg-base-900 ring-1 ring-base-700 flex items-center justify-center';
  const previewImg = document.createElement('img');
  previewImg.className = 'absolute inset-0 w-full h-full object-cover';
  previewImg.alt = 'Puzzle preview';
  preview.appendChild(previewImg);
  const previewHint = document.createElement('span');
  previewHint.className = 'absolute text-slate-500 text-sm';
  previewHint.textContent = 'Pick an image to preview';
  preview.appendChild(previewHint);
  previewCard.appendChild(preview);
  row1.appendChild(previewCard);

  // ==== Row 1 right: library grid ==========================================
  const libraryCard = document.createElement('div');
  libraryCard.className =
    'flex flex-col gap-4 p-5 rounded-3xl bg-base-800/60 ring-1 ring-base-700';
  row1.appendChild(libraryCard);

  // ==== Row 2 left: upload box =============================================
  const uploadCard = document.createElement('div');
  uploadCard.className =
    'flex p-5 rounded-3xl bg-base-800/60 ring-1 ring-base-700';

  // ==== Row 2 right column: difficulty + start =============================
  const rightCol = document.createElement('div');
  rightCol.className = 'flex flex-col gap-5';

  row2.appendChild(uploadCard);
  row2.appendChild(rightCol);

  const libHead = document.createElement('div');
  libHead.className = 'flex items-center justify-between gap-3';
  const libTitle = document.createElement('span');
  libTitle.className = 'text-sm font-semibold text-slate-200';
  libTitle.textContent = 'Choose an image';
  libHead.appendChild(libTitle);

  const shuffleBtn = document.createElement('button');
  shuffleBtn.className =
    'flex items-center gap-2 px-4 py-2 rounded-full bg-base-700 hover:bg-base-600 transition-colors text-xs font-semibold disabled:opacity-40 disabled:pointer-events-none';
  shuffleBtn.appendChild(icon(icons.shuffle, 'w-4 h-4'));
  shuffleBtn.appendChild(document.createTextNode('Shuffle'));
  libHead.appendChild(shuffleBtn);
  libraryCard.appendChild(libHead);

  // --- Carousel state -------------------------------------------------------
  // The preview auto-rotates through random library images every 10s until the
  // user interacts (picks/shuffles). Manual selection stops the auto-rotation.
  let autoRotate = true;
  let rotateTimer: number | undefined;

  const stopRotation = () => {
    autoRotate = false;
    if (rotateTimer !== undefined) {
      clearTimeout(rotateTimer);
      rotateTimer = undefined;
    }
  };

  const scheduleRotation = () => {
    if (rotateTimer !== undefined) clearTimeout(rotateTimer);
    rotateTimer = window.setTimeout(() => {
      if (!autoRotate) return;
      const entry = nextImage(library, selectedId ?? undefined);
      if (entry) previewOnly(entry, 'auto');
      scheduleRotation();
    }, 10_000);
  };

  const enableStart = () => {
    startBtn.disabled = false;
    startBtn.classList.remove('opacity-50', 'pointer-events-none');
  };

  // Update just the preview image (used by the carousel and by selection).
  // `dir` chooses the slide direction; 'auto' rotates carousel-style.
  let slideDir = 1;
  const setPreview = (entry: LibraryImage, dir: 'left' | 'right' | 'auto' | 'none') => {
    previewImg.src = entry.src;
    previewHint.classList.add('hidden');
    if (dir === 'none') return;
    let from = 'translateX(0)';
    if (dir === 'auto') {
      // Alternate slide direction each auto-advance for a carousel feel.
      slideDir *= -1;
      from = `translateX(${slideDir * 24}px)`;
    } else if (dir === 'left') {
      from = 'translateX(24px)';
    } else if (dir === 'right') {
      from = 'translateX(-24px)';
    }
    animate(
      previewImg,
      [
        { opacity: 0.35, transform: from },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  };

  // Preview an entry without committing it as the selection (carousel).
  const previewOnly = (entry: LibraryImage, dir: 'left' | 'right' | 'auto' | 'none') => {
    carouselId = entry.id;
    setPreview(entry, dir);
  };
  // The image currently shown by the carousel (may differ from selection).
  let carouselId: string | null = null;

  // Commit an entry as the chosen puzzle image. Stops auto-rotation.
  const selectImage = (entry: LibraryImage, options: { count?: boolean } = {}) => {
    stopRotation();
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      selectedImage = img;
      selectedId = entry.id;
      setPreview(entry, 'none');
      previewImg.src = entry.src;
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

  shuffleBtn.addEventListener('click', () => {
    const entry = nextImage(library, selectedId ?? carouselId ?? undefined);
    if (!entry) return;
    selectImage(entry, { count: true });
  });

  // --- Library grid (3×2, with a "View more" 6th cell) ---------------------
  const thumbButtons = new Map<string, HTMLButtonElement>();

  const refreshSelection = () => {
    for (const [id, btn] of thumbButtons) {
      btn.className = thumbClass(id === selectedId);
    }
  };

  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-3 gap-3';
  libraryCard.appendChild(grid);

  const sourceNote = document.createElement('p');
  sourceNote.className = 'text-[11px] text-slate-500';
  libraryCard.appendChild(sourceNote);

  const uploadCount = () => library.filter((i) => i.source === 'uploaded').length;

  const onRemove = (id: string) => void removeUpload(id).then(refreshLibrary);

  const renderGrid = () => {
    grid.innerHTML = '';
    thumbButtons.clear();

    const uploads = uploadCount();
    const showingPlaceholders = uploads === 0;

    // Placeholder set (no uploads): show all five, then an "Add image" tile in
    // the sixth cell that opens the upload dialog. Uploaded library: show up to
    // six inline; beyond six the sixth cell becomes "View more".
    const inlineCount = !showingPlaceholders && library.length > 6 ? 5 : 6;
    const inline = library.slice(0, inlineCount);
    for (const image of inline) {
      grid.appendChild(renderThumb(image, selectImage, thumbButtons, onRemove));
    }
    if (showingPlaceholders) {
      grid.appendChild(renderAddTile(() => openUploadDialog()));
    } else if (library.length > 6) {
      grid.appendChild(
        renderViewMore(library.length - inline.length, () => showLibraryModal()),
      );
    }

    refreshSelection();

    shuffleBtn.disabled = library.length === 0;
    sourceNote.textContent = uploads
      ? `Your library — ${uploads} / ${MAX_LIBRARY_IMAGES} images`
      : 'Placeholder set — add your own images to make it yours';
  };

  // Full-library modal: every image in a scrollable grid.
  const showLibraryModal = () => {
    play('select');
    showAllImages(container, library, selectedId, (entry) => {
      selectImage(entry, { count: true });
    }, onRemove);
  };

  // Re-read the pool after uploads change, keeping the current selection valid.
  const refreshLibrary = async () => {
    const first = library.length === 0;
    // Whether the image currently on screen still exists after the refresh.
    const shownId = selectedId ?? carouselId;

    library = await getLibrary();

    // The selected image was removed — drop the selection.
    if (selectedId && !library.some((i) => i.id === selectedId)) {
      selectedId = null;
      selectedImage = null;
      startBtn.disabled = true;
      startBtn.classList.add('opacity-50', 'pointer-events-none');
    }
    renderGrid();

    // First population: seed the carousel with a random image and start it.
    if (first && library.length > 0) {
      const entry = nextImage(library, undefined);
      if (entry) {
        previewOnly(entry, 'none');
        if (autoRotate) scheduleRotation();
      }
      return;
    }

    // The image on screen no longer exists (it was removed) — advance the
    // preview to another image immediately rather than leaving a stale/blank
    // frame. Slide it in like a carousel step.
    if (shownId && !library.some((i) => i.id === shownId)) {
      const entry = nextImage(library, shownId);
      if (entry) {
        previewOnly(entry, 'auto');
        if (autoRotate) scheduleRotation();
      } else {
        // Library is genuinely empty (shouldn't happen while placeholders
        // exist, but guard anyway).
        stopRotation();
        carouselId = null;
        previewImg.removeAttribute('src');
        previewHint.classList.remove('hidden');
      }
    }
  };

  // --- Add images (drag-drop + file select) ---------------------------------
  const handleFiles = async (files: File[]) => {
    const room = MAX_LIBRARY_IMAGES - uploadCount();
    if (room <= 0) {
      showLimitDialog(container, uploadCount(), 0, files.length);
      return;
    }

    const accepted = files.slice(0, room);
    const rejected = files.length - accepted.length;

    // Loading screen while images are encoded and stored.
    const loader = showLoading(container, accepted.length);
    const { added, failed } = await addUploads(accepted, loader.update);
    loader.close();

    await refreshLibrary();
    if (added[0]) {
      selectImage({ id: added[0].id, title: added[0].title, src: added[0].url, source: 'uploaded' });
    }
    if (rejected > 0) {
      showLimitDialog(container, uploadCount(), added.length, rejected);
    }
    void failed;
  };

  // Hidden file input backing the grid's "Add image" tile — a direct file
  // picker without needing the drag-drop card.
  const gridFileInput = document.createElement('input');
  gridFileInput.type = 'file';
  gridFileInput.accept = 'image/*';
  gridFileInput.multiple = true;
  gridFileInput.className = 'hidden';
  gridFileInput.addEventListener('change', () => {
    const files = gridFileInput.files ? Array.from(gridFileInput.files) : [];
    gridFileInput.value = '';
    if (files.length) void handleFiles(files);
  });
  container.appendChild(gridFileInput);
  const openUploadDialog = () => {
    play('select');
    gridFileInput.click();
  };

  const addZone = renderAddZone((files) => void handleFiles(files));
  uploadCard.appendChild(addZone);

  // Difficulty selector: sets how fine the tile grid is.
  const diffSection = document.createElement('div');
  diffSection.className = 'flex flex-col gap-2 p-5 rounded-3xl bg-base-800/60 ring-1 ring-base-700';
  const diffLabel = document.createElement('span');
  diffLabel.className = 'text-sm font-semibold text-slate-200';
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
  rightCol.appendChild(diffSection);

  // Start
  const startBtn = document.createElement('button');
  startBtn.className =
    'flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-accent hover:bg-accent-hover text-base-900 font-semibold transition-colors shadow-lg shadow-black/40 opacity-50 pointer-events-none';
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
  rightCol.appendChild(startBtn);

  root.appendChild(container);

  // Populate from IndexedDB (async); shows the placeholder set until then.
  void refreshLibrary();

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

// The "Add image" tile — the 6th cell of the placeholder grid. Opens the
// upload dialog so the user can start their own library.
function renderAddTile(onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className =
    'flex flex-col items-center justify-center gap-1 aspect-video rounded-xl bg-base-900 border-2 border-dashed border-base-600 hover:border-accent hover:bg-accent/5 text-slate-300 transition-colors';
  btn.title = 'Add your own image';
  btn.appendChild(icon(icons.upload, 'w-6 h-6'));
  const label = document.createElement('span');
  label.className = 'text-xs font-semibold';
  label.textContent = 'Add image';
  btn.appendChild(label);
  btn.addEventListener('click', onClick);
  return btn;
}

// The "View more" tile — the 6th cell when the library holds more than six
// images. `hidden` is how many images aren't shown inline.
function renderViewMore(hidden: number, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className =
    'flex flex-col items-center justify-center gap-1 aspect-video rounded-xl bg-base-900 ring-1 ring-base-700 hover:ring-base-500 text-slate-300 transition-all';
  btn.appendChild(icon(icons.image, 'w-6 h-6'));
  const label = document.createElement('span');
  label.className = 'text-xs font-semibold';
  label.textContent = 'View more';
  btn.appendChild(label);
  const count = document.createElement('span');
  count.className = 'text-[11px] text-slate-500 tabular-nums';
  count.textContent = `+${hidden}`;
  btn.appendChild(count);
  btn.addEventListener('click', onClick);
  return btn;
}

// Full-library modal: every image in a scrollable grid. Picking one closes the
// modal and selects it.
function showAllImages(
  host: HTMLElement,
  library: LibraryImage[],
  selectedId: string | null,
  onPick: (image: LibraryImage) => void,
  onRemove: (id: string) => void,
): void {
  const overlay = document.createElement('div');
  overlay.className =
    'fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-sm';

  const cardEl = document.createElement('div');
  cardEl.className =
    'flex flex-col gap-4 p-5 sm:p-6 rounded-3xl bg-base-800 ring-1 ring-base-700 w-full max-w-3xl max-h-[85vh] shadow-2xl';

  const head = document.createElement('div');
  head.className = 'flex items-center justify-between gap-3';
  const title = document.createElement('h2');
  title.className = 'text-lg font-semibold';
  title.textContent = `Your library — ${library.length} image${library.length === 1 ? '' : 's'}`;
  head.appendChild(title);
  const closeBtn = document.createElement('button');
  closeBtn.className =
    'flex items-center justify-center w-9 h-9 rounded-full bg-base-700 hover:bg-base-600 transition-colors';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.appendChild(icon(icons.close, 'w-5 h-5'));
  head.appendChild(closeBtn);
  cardEl.appendChild(head);

  const scroll = document.createElement('div');
  scroll.className = 'overflow-y-auto -mx-1 px-1 no-scrollbar';
  const modalGrid = document.createElement('div');
  modalGrid.className = 'grid grid-cols-3 sm:grid-cols-4 gap-3';
  const registry = new Map<string, HTMLButtonElement>();

  const close = () => {
    const anim = animate(overlay, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 });
    if (anim) anim.finished.then(() => overlay.remove());
    else overlay.remove();
  };

  for (const image of library) {
    const btn = renderThumb(
      image,
      (img) => {
        onPick(img);
        close();
      },
      registry,
      (id) => {
        onRemove(id);
        const b = registry.get(id);
        if (b) b.remove();
      },
    );
    if (image.id === selectedId) btn.className = thumbClass(true);
    modalGrid.appendChild(btn);
  }
  scroll.appendChild(modalGrid);
  cardEl.appendChild(scroll);

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.appendChild(cardEl);
  host.appendChild(overlay);
  animate(overlay, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
  animate(
    cardEl,
    [
      { opacity: 0, transform: 'scale(0.96) translateY(8px)' },
      { opacity: 1, transform: 'scale(1) translateY(0)' },
    ],
    { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  );
}

// Drag-and-drop zone with a file-select fallback. Calls back with picked files.
function renderAddZone(
  onFiles: (files: File[]) => void,
): HTMLElement {
  const zone = document.createElement('div');
  zone.className =
    'flex flex-col items-center justify-center gap-2 flex-1 py-5 px-4 rounded-2xl border-2 border-dashed border-base-700 text-center transition-colors';

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

// Popup card shown when an upload would exceed MAX_LIBRARY_IMAGES. `added` is
// how many made it in this batch, `rejected` how many were turned away.
function showLimitDialog(
  host: HTMLElement,
  total: number,
  added: number,
  rejected: number,
): void {
  play('select');

  const overlay = document.createElement('div');
  overlay.className =
    'fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm';

  const cardEl = document.createElement('div');
  cardEl.className =
    'flex flex-col gap-4 p-6 rounded-3xl bg-base-800 ring-1 ring-base-700 w-full max-w-sm text-center shadow-2xl';

  const iconWrap = document.createElement('div');
  iconWrap.className =
    'self-center grid place-items-center w-12 h-12 rounded-full bg-amber-500/15 text-amber-400';
  iconWrap.appendChild(icon(icons.image, 'w-6 h-6'));
  cardEl.appendChild(iconWrap);

  const title = document.createElement('h2');
  title.className = 'text-lg font-semibold';
  title.textContent = 'Library is full';
  cardEl.appendChild(title);

  const msg = document.createElement('p');
  msg.className = 'text-sm text-slate-400';
  const rejectedText = `${rejected} image${rejected === 1 ? '' : 's'}`;
  msg.textContent = added
    ? `Added ${added}, but ${rejectedText} didn't fit. Your library holds up to ${MAX_LIBRARY_IMAGES} images (now at ${total}). Remove some to add more.`
    : `Your library already holds the maximum of ${MAX_LIBRARY_IMAGES} images. Remove some to add ${rejectedText}.`;
  cardEl.appendChild(msg);

  const ok = document.createElement('button');
  ok.className =
    'self-center mt-1 px-6 py-2 rounded-full bg-accent hover:bg-accent-hover text-base-900 font-semibold transition-colors';
  ok.textContent = 'Got it';
  const close = () => {
    const anim = animate(overlay, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 });
    if (anim) anim.finished.then(() => overlay.remove());
    else overlay.remove();
  };
  ok.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  cardEl.appendChild(ok);

  overlay.appendChild(cardEl);
  host.appendChild(overlay);

  animate(overlay, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
  animate(
    cardEl,
    [
      { opacity: 0, transform: 'scale(0.95) translateY(8px)' },
      { opacity: 1, transform: 'scale(1) translateY(0)' },
    ],
    { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  );
}

// Full-screen loading overlay shown while uploads are encoded and stored.
// Returns an updater (done, total) for live progress and a close().
function showLoading(
  host: HTMLElement,
  total: number,
): { update: (done: number, total: number) => void; close: () => void } {
  const overlay = document.createElement('div');
  overlay.className =
    'fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm';

  const cardEl = document.createElement('div');
  cardEl.className =
    'flex flex-col items-center gap-4 p-8 rounded-3xl bg-base-800 ring-1 ring-base-700 w-full max-w-sm text-center shadow-2xl';

  // Spinner.
  const spinner = document.createElement('div');
  spinner.className =
    'w-10 h-10 rounded-full border-4 border-base-600 border-t-accent animate-spin';
  cardEl.appendChild(spinner);

  const title = document.createElement('h2');
  title.className = 'text-lg font-semibold';
  title.textContent =
    total === 1 ? 'Making your image puzzle-ready…' : 'Making your images puzzle-ready…';
  cardEl.appendChild(title);

  const count = document.createElement('p');
  count.className = 'text-sm text-slate-400 tabular-nums';
  count.textContent = `0 / ${total}`;
  cardEl.appendChild(count);

  // Progress bar.
  const track = document.createElement('div');
  track.className = 'w-full h-2 rounded-full bg-base-700 overflow-hidden';
  const fill = document.createElement('div');
  fill.className = 'h-full bg-accent transition-[width] duration-200 ease-out';
  fill.style.width = '0%';
  track.appendChild(fill);
  cardEl.appendChild(track);

  overlay.appendChild(cardEl);
  host.appendChild(overlay);
  animate(overlay, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 });

  return {
    update: (done, t) => {
      count.textContent = `${done} / ${t}`;
      fill.style.width = `${Math.round((done / t) * 100)}%`;
    },
    close: () => {
      const anim = animate(overlay, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 });
      if (anim) anim.finished.then(() => overlay.remove());
      else overlay.remove();
    },
  };
}

// Settings panel: toggle timer / score / streak, plus a read-out of best stats.
function showSettings(host: HTMLElement): void {
  play('select');
  const settings = loadSettings();

  const overlay = document.createElement('div');
  overlay.className =
    'fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm';

  const cardEl = document.createElement('div');
  cardEl.className =
    'flex flex-col gap-5 p-6 rounded-3xl bg-base-800 ring-1 ring-base-700 w-full max-w-sm shadow-2xl';

  const heading = document.createElement('div');
  heading.className = 'flex items-center gap-2';
  heading.appendChild(icon(icons.settings, 'w-5 h-5 text-accent'));
  const title = document.createElement('h2');
  title.className = 'text-lg font-semibold';
  title.textContent = 'Settings';
  heading.appendChild(title);
  cardEl.appendChild(heading);

  const note = document.createElement('p');
  note.className = 'text-xs text-slate-500 -mt-3';
  note.textContent = 'Applies to your next puzzle.';
  cardEl.appendChild(note);

  const rows = document.createElement('div');
  rows.className = 'flex flex-col gap-2';
  cardEl.appendChild(rows);

  const toggleRow = (
    iconNode: Parameters<typeof icon>[0],
    label: string,
    desc: string,
    key: keyof Settings,
  ) => {
    const row = document.createElement('button');
    row.className =
      'flex items-center gap-3 p-3 rounded-2xl bg-base-900/50 ring-1 ring-base-700 hover:ring-base-500 transition-colors text-left';

    const ic = icon(iconNode, 'w-5 h-5 text-slate-300 shrink-0');
    row.appendChild(ic);

    const text = document.createElement('div');
    text.className = 'flex flex-col flex-1 min-w-0';
    const name = document.createElement('span');
    name.className = 'text-sm font-medium';
    name.textContent = label;
    const d = document.createElement('span');
    d.className = 'text-[11px] text-slate-500';
    d.textContent = desc;
    text.appendChild(name);
    text.appendChild(d);
    row.appendChild(text);

    // Switch.
    const sw = document.createElement('span');
    const knob = document.createElement('span');
    knob.className =
      'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all duration-200';
    const paint = () => {
      const on = settings[key];
      sw.className =
        'relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ' +
        (on ? 'bg-accent' : 'bg-base-600');
      knob.style.left = on ? '22px' : '2px';
    };
    sw.appendChild(knob);
    paint();
    row.appendChild(sw);

    row.addEventListener('click', () => {
      settings[key] = !settings[key];
      saveSettings(settings);
      paint();
      play('select');
    });
    rows.appendChild(row);
  };

  toggleRow(icons.timer, 'Timer', 'Show a running clock while you play.', 'timer');
  toggleRow(icons.score, 'Score', 'Rate each solve by speed and moves.', 'score');
  toggleRow(icons.streak, 'Streak', 'Count consecutive solves.', 'streak');

  // --- Background: upload a custom image, or reset to the void backdrop. -----
  const bgSection = document.createElement('div');
  bgSection.className = 'flex flex-col gap-2 pt-2 border-t border-base-700';
  const bgHead = document.createElement('div');
  bgHead.className = 'flex items-center gap-2';
  bgHead.appendChild(icon(icons.image, 'w-4 h-4 text-slate-400'));
  const bgLabel = document.createElement('span');
  bgLabel.className = 'text-sm font-medium';
  bgLabel.textContent = 'Background';
  bgHead.appendChild(bgLabel);
  bgSection.appendChild(bgHead);

  const bgDesc = document.createElement('p');
  bgDesc.className = 'text-[11px] text-slate-500';
  bgDesc.textContent = 'Set your own image behind the app, or keep the Void backdrop.';
  bgSection.appendChild(bgDesc);

  const bgRow = document.createElement('div');
  bgRow.className = 'flex items-center gap-2';

  const bgInput = document.createElement('input');
  bgInput.type = 'file';
  bgInput.accept = 'image/*';
  bgInput.className = 'hidden';

  const bgUpload = document.createElement('button');
  bgUpload.className =
    'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-base-700 hover:bg-base-600 transition-colors text-sm font-medium';
  bgUpload.appendChild(icon(icons.upload, 'w-4 h-4'));
  bgUpload.appendChild(document.createTextNode('Upload image'));
  bgUpload.addEventListener('click', () => bgInput.click());

  const bgReset = document.createElement('button');
  const paintReset = () => {
    bgReset.disabled = !hasBackground();
    bgReset.className =
      'flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-base-900 ring-1 ring-base-700 hover:ring-base-500 transition-colors text-sm font-medium disabled:opacity-40 disabled:pointer-events-none';
  };
  bgReset.appendChild(document.createTextNode('Reset to Void'));
  paintReset();
  bgReset.addEventListener('click', () => {
    clearBackground()
      .catch((err) => console.warn('Could not clear background.', err))
      .finally(paintReset);
    play('select');
  });

  bgInput.addEventListener('change', () => {
    const file = bgInput.files?.[0];
    bgInput.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    setBackground(file)
      .catch((err) => console.warn('Could not set background.', err))
      .finally(paintReset);
    play('select');
  });

  bgRow.appendChild(bgUpload);
  bgRow.appendChild(bgReset);
  bgRow.appendChild(bgInput);
  bgSection.appendChild(bgRow);
  cardEl.appendChild(bgSection);

  // Best-stats read-out.
  const stats = loadStats();
  if (stats.bestScore > 0 || stats.longestStreak > 0) {
    const best = document.createElement('div');
    best.className =
      'flex items-center justify-around gap-2 pt-1 text-center text-xs text-slate-400';
    const cell = (label: string, value: string) => {
      const c = document.createElement('div');
      c.className = 'flex flex-col';
      const v = document.createElement('span');
      v.className = 'text-base font-semibold text-slate-200 tabular-nums';
      v.textContent = value;
      const l = document.createElement('span');
      l.textContent = label;
      c.appendChild(v);
      c.appendChild(l);
      return c;
    };
    best.appendChild(cell('Best score', `${stats.bestScore}`));
    best.appendChild(cell('Longest streak', `${stats.longestStreak}`));
    cardEl.appendChild(best);
  }

  const done = document.createElement('button');
  done.className =
    'self-stretch mt-1 px-6 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-base-900 font-semibold transition-colors';
  done.textContent = 'Done';
  const close = () => {
    const anim = animate(overlay, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 });
    if (anim) anim.finished.then(() => overlay.remove());
    else overlay.remove();
  };
  done.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  cardEl.appendChild(done);

  overlay.appendChild(cardEl);
  host.appendChild(overlay);
  animate(overlay, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
  animate(
    cardEl,
    [
      { opacity: 0, transform: 'scale(0.96) translateY(8px)' },
      { opacity: 1, transform: 'scale(1) translateY(0)' },
    ],
    { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  );
}
