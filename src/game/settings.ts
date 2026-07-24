// Player-facing gameplay toggles, persisted to localStorage. All default ON;
// turning one off hides that feature during play (see game.ts).

export interface Settings {
  /** Show a running timer during the game. */
  timer: boolean;
  /** Score the solve (time + moves) and show it on the win screen. */
  score: boolean;
  /** Track a win streak (consecutive solves without exiting mid-game). */
  streak: boolean;
}

const KEY = 'tileswitch:settings:v1';

const DEFAULTS: Settings = { timer: true, score: true, streak: true };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        timer: typeof parsed.timer === 'boolean' ? parsed.timer : DEFAULTS.timer,
        score: typeof parsed.score === 'boolean' ? parsed.score : DEFAULTS.score,
        streak: typeof parsed.streak === 'boolean' ? parsed.streak : DEFAULTS.streak,
      };
    }
  } catch {
    /* fall through to defaults */
  }
  return { ...DEFAULTS };
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* best-effort */
  }
}
