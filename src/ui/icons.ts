import {
  createElement,
  Puzzle,
  Upload,
  Image as ImageIcon,
  RotateCcw,
  Trophy,
  ArrowLeft,
  Volume2,
  VolumeX,
  Eye,
  Shuffle,
  Trash2,
  Timer,
  Flame,
  Star,
  SlidersHorizontal,
  X,
  LayoutGrid,
  Share2,
  StickyNote,
  ArrowRight,
  type IconNode,
} from 'lucide';

// Thin wrapper around lucide's createElement so we get an <svg> element with
// consistent sizing/stroke, ready to drop into the DOM.

export function icon(node: IconNode, className = 'w-5 h-5'): SVGElement {
  const el = createElement(node);
  el.setAttribute('stroke-width', '2');
  el.classList.add(...className.split(' '));
  return el;
}

export const icons = {
  puzzle: Puzzle,
  upload: Upload,
  image: ImageIcon,
  restart: RotateCcw,
  trophy: Trophy,
  back: ArrowLeft,
  soundOn: Volume2,
  soundOff: VolumeX,
  peek: Eye,
  shuffle: Shuffle,
  trash: Trash2,
  timer: Timer,
  streak: Flame,
  score: Star,
  settings: SlidersHorizontal,
  close: X,
  progress: LayoutGrid,
  share: Share2,
  note: StickyNote,
  next: ArrowRight,
};
