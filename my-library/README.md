# My Library

Drop your own pictures in this folder. They are **git-ignored** (private to you)
and become puzzles automatically — no code changes needed.

## How it works

The app scans this folder at build/dev time with a Vite glob, so **any** image
you add here is picked up the next time the dev server reloads (it will already
be running — Vite hot-reloads on new files) or the next build.

## Naming convention

Any of these extensions are detected: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`,
`.avif`.

The **title** shown in the app is derived from the file name:

- Drop the extension.
- Replace `-` and `_` with spaces.
- Title-case each word.

Examples:

| File name                | Title in app       |
| ------------------------ | ------------------ |
| `sunset-over-the-bay.jpg`| Sunset Over The Bay|
| `my_dog_rex.png`         | My Dog Rex         |
| `Eiffel Tower.webp`      | Eiffel Tower       |

To control ordering, prefix with a number — it is stripped from the title:

- `01-favorite.jpg` → sorts first, titled **Favorite**.

That's it. Add files, and they join the shuffle rotation with everything else.
