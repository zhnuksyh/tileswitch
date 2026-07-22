import type { Piece, Puzzle } from './model';

// Paints a square tile onto an element by setting the source image as a
// background positioned to show that piece's region of the image.

export function paintTile(el: HTMLElement, puzzle: Puzzle, piece: Piece): void {
  const { cellSize, image, boardWidth, boardHeight } = puzzle;
  el.style.backgroundImage = `url(${image.src})`;
  el.style.backgroundSize = `${boardWidth}px ${boardHeight}px`;
  el.style.backgroundPosition = `-${piece.col * cellSize}px -${piece.row * cellSize}px`;
  el.style.backgroundRepeat = 'no-repeat';
}
