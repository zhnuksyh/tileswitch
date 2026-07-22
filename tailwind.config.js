/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,js}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Fredoka', 'system-ui', 'sans-serif'],
      },
      colors: {
        base: {
          900: '#0f172a',
          800: '#1e293b',
          700: '#334155',
          600: '#475569',
        },
        accent: {
          DEFAULT: '#38bdf8',
          hover: '#0ea5e9',
        },
      },
    },
  },
  plugins: [],
};
