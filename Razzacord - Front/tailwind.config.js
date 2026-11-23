/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        'ch-bg-deep': '#1b2d4d',
        'ch-bg-darker': '#14243f',
        'ch-bg-dark': '#22375d',
        'ch-bg-medium': '#1d3458',
        'ch-bg-mediumer': '#29476d',
        'ch-bg-light': '#355d86',
        'ch-bg-lighter': '#46769d',
        'ch-border': '#3a5c82',
        'ch-text-primary': '#f7fafc',
        'ch-text-muted': '#b3c8dc',
        'ch-brand': '#66aaf2',
        'ch-brand-hover': '#4d91d7',
        'ch-brand-light': '#99cbf5',
        'ch-accent': '#82bfea',
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
