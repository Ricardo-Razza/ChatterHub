/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        'ch-bg-deep': '#0b0e14',
        'ch-bg-darker': '#11151f',
        'ch-bg-dark': '#1a202c',
        'ch-bg-medium': '#222838',
        'ch-bg-mediumer': '#283042',
        'ch-bg-light': '#2f384d',
        'ch-bg-lighter': '#38435c',
        'ch-border': '#2d364a',
        'ch-text-primary': '#f1f5f9',
        'ch-text-muted': '#94a3b8',
        'ch-brand': '#5865f2',
        'ch-brand-hover': '#4752c4',
        'ch-brand-light': '#858ff7',
        'ch-accent': '#00d4ff',
        'ch-success': '#22c55e',
        'ch-danger': '#ef4444',
        'ch-warning': '#f59e0b',
      },
      boxShadow: {
        'brand-glow': '0 0 20px rgba(88, 101, 242, 0.35)',
        'speaking': '0 0 12px rgba(34, 197, 94, 0.45)',
        'card': '0 4px 14px rgba(0, 0, 0, 0.25)',
      },
    },
  },
  plugins: [],
}
