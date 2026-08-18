import type { Config } from 'tailwindcss';

/**
 * Premium, dark-first design tokens. Original identity (not a Meshy clone):
 * near-black canvas, cool neutral surfaces, a single restrained accent.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#0a0b0d',
        surface: {
          DEFAULT: '#111317',
          raised: '#171a1f',
          hover: '#1d2127',
        },
        border: {
          DEFAULT: '#23272e',
          strong: '#2e333b',
        },
        content: {
          DEFAULT: '#e8eaed',
          muted: '#9aa0a8',
          faint: '#6b7178',
        },
        accent: {
          DEFAULT: '#7c8cff',
          hover: '#9aa6ff',
          soft: 'rgba(124,140,255,0.12)',
        },
        success: '#4ade80',
        danger: '#f87171',
        warning: '#fbbf24',
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        lg: '0.75rem',
        xl: '1rem',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
