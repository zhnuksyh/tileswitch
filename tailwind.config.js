/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './trailer/**/*.{html,ts,js}', './src/**/*.{ts,js}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Fredoka', 'system-ui', 'sans-serif'],
      },
      // "Void" preset — pure black / white / grey. Kept as the `base`/`accent`
      // names the whole UI already references, so the switch is palette-only.
      colors: {
        base: {
          900: '#0a0a0a',
          800: '#171717',
          700: '#262626',
          600: '#404040',
        },
        // Highlights read as "brighter grey" rather than stark white.
        accent: {
          DEFAULT: '#d4d4d4',
          hover: '#e5e5e5',
        },
      },
    },
  },
  plugins: [],
};
