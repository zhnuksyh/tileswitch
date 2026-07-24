// The custom app background. One user-chosen image, stored as a Blob in the KV
// store, applied as a dimmed fixed layer behind the whole app. Absent by
// default — the app then shows the plain "void" background.

import { kvGet, kvSet, kvDelete, requestPersistence } from './db';

const KEY = 'background:v1';

let currentUrl: string | null = null;
let layer: HTMLElement | null = null;

// The fixed, full-viewport layer that holds the background image. It sits
// behind #app (z-index -1) and is dimmed so foreground UI stays readable.
function ensureLayer(): HTMLElement {
  if (layer) return layer;
  const el = document.createElement('div');
  el.id = 'app-bg';
  el.setAttribute('aria-hidden', 'true');
  el.className = 'fixed inset-0 -z-10 bg-cover bg-center transition-opacity duration-500';
  el.style.opacity = '0';
  // Darkening + slight blur so text/cards stay legible over any photo.
  const scrim = document.createElement('div');
  scrim.className = 'absolute inset-0 bg-base-900/70 backdrop-blur-sm';
  el.appendChild(scrim);
  document.body.insertBefore(el, document.body.firstChild);
  layer = el;
  return el;
}

function paint(url: string | null): void {
  const el = ensureLayer();
  if (url) {
    el.style.backgroundImage = `url("${url}")`;
    el.style.opacity = '1';
  } else {
    el.style.opacity = '0';
    el.style.backgroundImage = '';
  }
}

function setUrl(url: string | null): void {
  if (currentUrl && currentUrl !== url) URL.revokeObjectURL(currentUrl);
  currentUrl = url;
  paint(url);
}

/** Load and apply the saved background (if any). Call once on startup. */
export async function initBackground(): Promise<void> {
  try {
    const blob = await kvGet<Blob>(KEY);
    if (blob) setUrl(URL.createObjectURL(blob));
  } catch {
    /* no background — leave the void background */
  }
}

/** True if a custom background is currently set. */
export function hasBackground(): boolean {
  return currentUrl !== null;
}

/** Store `file` as the background and apply it immediately. */
export async function setBackground(file: File): Promise<void> {
  requestPersistence();
  await kvSet(KEY, file);
  setUrl(URL.createObjectURL(file));
}

/** Remove the custom background, reverting to the void background. */
export async function clearBackground(): Promise<void> {
  await kvDelete(KEY);
  setUrl(null);
}
