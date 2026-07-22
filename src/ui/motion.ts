// Small motion helpers. Everything degrades gracefully when the user prefers
// reduced motion — animations become instant.

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Run el.animate unless reduced motion is preferred, in which case the final
 * keyframe is applied instantly. Returns the Animation, or null when skipped.
 */
export function animate(
  el: Element,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Animation | null {
  if (prefersReducedMotion()) return null;
  return el.animate(keyframes, options);
}
