/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        finance: {
          dark: '#0a0d14',
          panel: '#111520',
          border: '#1e2433',
          muted: '#8e9bb0',
          green: '#10b981',
          red: '#f43f5e',
          amber: '#f59e0b',
          blue: '#3b82f6',
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': { from: { transform: 'translateY(24px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        'slide-left': { from: { transform: 'translateX(24px)', opacity: '0' }, to: { transform: 'translateX(0)', opacity: '1' } },
        'flash': { '0%': { boxShadow: '0 0 0 2px rgba(96,165,250,0.9)' }, '100%': { boxShadow: '0 0 0 2px rgba(96,165,250,0)' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
        'slide-left': 'slide-left 200ms ease-out',
        'flash': 'flash 2.5s ease-out',
      },
    },
  },
  plugins: [],
};
