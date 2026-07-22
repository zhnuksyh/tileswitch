// The built-in image library: categories of ready-to-play pictures bundled
// under /public/library/<category>/. Swap the placeholder files for real
// artwork keeping the same filenames and these entries stay valid.
//
// Paths are resolved against Vite's BASE_URL so they work both at the domain
// root and under a project subpath (e.g. GitHub Pages /<repo>/).

export type CategoryId = 'anime' | 'cartoon' | 'vector';

export interface LibraryImage {
  id: string;
  title: string;
  /** Absolute-from-base URL, e.g. '/library/anime/spirited-away.png'. */
  src: string;
  category: CategoryId;
}

export interface Category {
  id: CategoryId;
  label: string;
  images: LibraryImage[];
}

/** Prefix a public-asset path with Vite's base URL (handles subpath deploys). */
function asset(path: string): string {
  return import.meta.env.BASE_URL.replace(/\/$/, '') + path;
}

function img(
  category: CategoryId,
  file: string,
  title: string,
): LibraryImage {
  const id = file.replace(/\.[^.]+$/, '');
  return {
    id: `${category}/${id}`,
    title,
    src: asset(`/library/${category}/${file}`),
    category,
  };
}

export const categories: Category[] = [
  {
    id: 'anime',
    label: 'Anime',
    images: [
      img('anime', 'spirited-away.png', 'Spirited Away'),
      img('anime', 'your-name.png', 'Your Name'),
      img('anime', 'demon-slayer.png', 'Demon Slayer'),
    ],
  },
  {
    id: 'cartoon',
    label: 'Cartoon',
    images: [
      img('cartoon', 'tom-and-jerry.png', 'Tom and Jerry'),
      img('cartoon', 'spongebob.png', 'SpongeBob'),
      img('cartoon', 'adventure-time.png', 'Adventure Time'),
    ],
  },
  {
    id: 'vector',
    label: 'Vector art',
    images: [
      img('vector', 'mountain-sunrise.png', 'Mountain Sunrise'),
      img('vector', 'city-skyline.png', 'City Skyline'),
      img('vector', 'tropical-beach.png', 'Tropical Beach'),
    ],
  },
];
