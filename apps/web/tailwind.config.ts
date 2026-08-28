import type { Config } from 'tailwindcss';

/**
 * Base theme. The full token system lives in src/styles/tokens.css and
 * extends this with WCAG 2.2 AA verified colour pairs.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0f172a', muted: '#475569' },
        surface: { DEFAULT: '#ffffff', subtle: '#f8fafc', border: '#e2e8f0' },
        brand: { DEFAULT: '#1d4ed8', hover: '#1e40af' },
      },
    },
  },
  plugins: [],
};
export default config;
