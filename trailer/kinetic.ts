// Small, reusable kinetic-typography building blocks, built as plain DOM +
// CSS-animation helpers (this app is vanilla TS, not React). The trailer clock
// only decides *which* scene is mounted; each scene's internal beats are pure
// CSS animations with delays relative to its mount, so there is no per-frame
// layout work for the motion itself.
//
// Gotcha the recipe warns about: don't bake a text colour into a shared style
// constant, because two equal-specificity Tailwind colour utilities resolve by
// stylesheet order, not class-string order. So the shared strings below are
// colourless — set colour at the call site.

export type Entrance = 'slam' | 'rise' | 'drop' | 'cut';

interface KOptions {
  /** Scene-relative start time (seconds) for the entrance. */
  at?: number;
  /** Scene-relative time (seconds) to play the exit. Omit to stay on screen. */
  until?: number;
  kind?: Entrance;
  className?: string;
  /** Entrance duration (s). */
  dur?: number;
}

const ENTER_DUR: Record<Entrance, number> = {
  slam: 0.42,
  rise: 0.5,
  drop: 0.52,
  cut: 0.01,
};

/**
 * A kinetic word/line wrapper. Applies an entrance animation at a scene-relative
 * `at`, and an optional exit at `until`, composed into a single `animation`
 * shorthand so they don't fight. Starts hidden (opacity:0) via `both` fill.
 */
export function K(content: string | Node, opts: KOptions = {}): HTMLElement {
  const { at = 0, until, kind = 'slam', className = '', dur } = opts;
  const el = document.createElement('div');
  el.className = className;
  if (typeof content === 'string') el.textContent = content;
  else el.appendChild(content);

  const enterDur = dur ?? ENTER_DUR[kind];
  const easing = kind === 'drop' ? 'var(--k-ease-pop)' : 'var(--k-ease-out)';
  const anims = [`k-${kind} ${enterDur}s ${easing} ${at}s both`];
  if (until !== undefined) {
    anims.push(`k-exit 0.26s var(--k-ease-out) ${until}s both`);
  }
  el.style.animation = anims.join(', ');
  return el;
}

/**
 * A line that reveals left-to-right with a clip-path inset animated in steps()
 * — mechanical typewriter feel. An optional blinking block caret trails it.
 */
export function TypeLine(
  text: string,
  opts: { at?: number; className?: string; cps?: number; caret?: boolean } = {},
): HTMLElement {
  const { at = 0, className = '', cps = 26, caret = true } = opts;
  const steps = Math.max(1, text.length);
  const dur = steps / cps;

  const wrap = document.createElement('div');
  wrap.className = `relative inline-flex items-baseline ${className}`;

  const span = document.createElement('span');
  span.textContent = text;
  span.style.animation = `k-type ${dur}s steps(${steps}, end) ${at}s both`;
  wrap.appendChild(span);

  if (caret) {
    const c = document.createElement('span');
    c.className = 'ml-1 inline-block w-[0.55ch] self-center bg-current';
    c.style.height = '0.9em';
    // Appear as typing starts, blink after it lands.
    c.style.animation = `k-cut 0.01s ${at}s both, k-caret 0.9s steps(1) ${
      at + dur
    }s infinite`;
    wrap.appendChild(c);
  }
  return wrap;
}

/** Overlapping same-cell layout: children stack in one grid cell and swap in
 * place (used when successive words occupy the same spot). */
export function Stack(children: HTMLElement[], className = ''): HTMLElement {
  const grid = document.createElement('div');
  grid.className = `grid ${className}`;
  for (const c of children) {
    c.style.gridArea = '1 / 1';
    grid.appendChild(c);
  }
  return grid;
}

/** Convenience: a flex column centered on the stage, the default scene shell. */
export function Center(className = ''): HTMLElement {
  const el = document.createElement('div');
  el.className =
    'absolute inset-0 flex flex-col items-center justify-center text-center px-8 ' +
    className;
  return el;
}
