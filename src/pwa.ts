import { registerSW } from 'virtual:pwa-register';

// Wires up the service worker and a lightweight install prompt so TileSwitch
// behaves as a real installable, offline-capable PWA.

// --- small toast helper --------------------------------------------------

function showToast(message: string, action?: { label: string; onClick: () => void }): void {
  const toast = document.createElement('div');
  toast.className =
    'fixed inset-x-0 bottom-4 z-50 mx-auto flex w-max max-w-[92vw] items-center gap-3 ' +
    'rounded-full border border-slate-700 bg-slate-900/95 px-4 py-2 text-sm text-slate-100 ' +
    'shadow-lg backdrop-blur';

  const text = document.createElement('span');
  text.textContent = message;
  toast.appendChild(text);

  const dismiss = () => toast.remove();

  if (action) {
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.className =
      'rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-900 ' +
      'transition hover:bg-white';
    btn.addEventListener('click', () => {
      action.onClick();
      dismiss();
    });
    toast.appendChild(btn);
  }

  const close = document.createElement('button');
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '×';
  close.className = 'ml-1 text-slate-400 transition hover:text-slate-100';
  close.addEventListener('click', dismiss);
  toast.appendChild(close);

  document.body.appendChild(toast);
}

// --- service worker ------------------------------------------------------

function registerServiceWorker(): void {
  const updateSW = registerSW({
    onNeedRefresh() {
      showToast('A new version is available.', {
        label: 'Reload',
        onClick: () => void updateSW(true),
      });
    },
    onOfflineReady() {
      showToast('Ready to play offline.');
    },
  });
}

// --- install prompt ------------------------------------------------------

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function registerInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    const promptEvent = e as BeforeInstallPromptEvent;
    showToast('Install TileSwitch on your device?', {
      label: 'Install',
      onClick: () => {
        void promptEvent.prompt();
      },
    });
  });
}

export function initPwa(): void {
  registerServiceWorker();
  registerInstallPrompt();
}
