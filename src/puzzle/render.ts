import type { Piece, Puzzle } from './model';

// Renders a single puzzle piece as a self-contained SVG element. The image is
// drawn shifted so that this piece's region aligns inside the tabbed outline,
// and a clipPath restricts it to the piece shape. A subtle stroke gives the
// pieces definition on the dark board.

let clipCounter = 0;

export function renderPieceSVG(puzzle: Puzzle, piece: Piece): SVGSVGElement {
  const { cellSize, image, boardWidth, boardHeight } = puzzle;
  const overhang = piece.overhang;
  const svgNS = 'http://www.w3.org/2000/svg';

  // The SVG canvas is one cell plus overhang on all sides.
  const svgSize = cellSize + overhang * 2;

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', String(svgSize));
  svg.setAttribute('height', String(svgSize));
  svg.setAttribute('viewBox', `0 0 ${svgSize} ${svgSize}`);
  svg.style.display = 'block';
  svg.style.overflow = 'visible';
  svg.style.pointerEvents = 'none';

  const clipId = `piece-clip-${clipCounter++}`;

  const defs = document.createElementNS(svgNS, 'defs');
  const clip = document.createElementNS(svgNS, 'clipPath');
  clip.setAttribute('id', clipId);
  const clipPathEl = document.createElementNS(svgNS, 'path');
  clipPathEl.setAttribute('d', piece.path);
  clip.appendChild(clipPathEl);
  defs.appendChild(clip);
  svg.appendChild(defs);

  // Group holds the image, clipped to the piece.
  const g = document.createElementNS(svgNS, 'g');
  g.setAttribute('clip-path', `url(#${clipId})`);

  const img = document.createElementNS(svgNS, 'image');
  // Scale full board image so its grid matches cellSize cells.
  const scaleX = boardWidth / image.naturalWidth;
  const scaleY = boardHeight / image.naturalHeight;
  img.setAttribute('href', image.src);
  img.setAttribute('width', String(image.naturalWidth * scaleX));
  img.setAttribute('height', String(image.naturalHeight * scaleY));
  // Offset so this piece's cell region lands at the piece origin (overhang).
  const offsetX = overhang - piece.col * cellSize;
  const offsetY = overhang - piece.row * cellSize;
  img.setAttribute('x', String(offsetX));
  img.setAttribute('y', String(offsetY));
  img.setAttribute('preserveAspectRatio', 'none');
  g.appendChild(img);
  svg.appendChild(g);

  // Outline stroke for definition.
  const outline = document.createElementNS(svgNS, 'path');
  outline.setAttribute('d', piece.path);
  outline.setAttribute('fill', 'none');
  outline.setAttribute('stroke', 'rgba(15,23,42,0.55)');
  outline.setAttribute('stroke-width', '1.5');
  svg.appendChild(outline);

  return svg;
}
