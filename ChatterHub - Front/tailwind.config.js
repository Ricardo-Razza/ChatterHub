/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Paleta ChatterHub - tons de azul profundo e ciano vibrante
        ch: {
          'bg-deep': '#0a0e17',      // fundo mais profundo
          'bg-darker': '#0f141f',    // sidebar de servidores
          'bg-dark': '#1a1f2e',      // sidebar de canais
          'bg-medium': '#232a3d',    // área de chat principal
          'bg-light': '#2d364a',     // hover / inputs
          'bg-lighter': '#384358',   // elementos ativos
          'border': '#1e2640',
          'surface': '#161b28',      // cards e containers
          'text-primary': '#e8ecf4',
          'text-secondary': '#a0aec8',
          'text-muted': '#6b7280',
          'text-link': '#64b5f6',
          'brand': '#4f8df5',        // azul principal
          'brand-hover': '#3b7ae3',
          'brand-light': '#7ba3f7',
          'accent': '#00d4ff',       // ciano vibrante para destaques
          'accent-hover': '#00b8e6',
          'success': '#10b981',      // status online / falando
          'success-glow': '#34d399',
          'danger': '#ef4444',
          'warning': '#f59e0b',
          'info': '#3b82f6',
        }
      },
      fontFamily: {
        sans: ['"Inter"', '"SF Pro Display"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'speaking': '0 0 0 3px #10b981, 0 0 16px 2px rgba(16, 185, 129, 0.5)',
        'brand-glow': '0 0 16px 2px rgba(79, 141, 245, 0.4)',
        'accent-glow': '0 0 16px 2px rgba(0, 212, 255, 0.3)',
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.15)',
        'card-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.2)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(16, 185, 129, 0.5)' },
          '100%': { boxShadow: '0 0 0 8px rgba(16, 185, 129, 0)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        }
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 3s ease-in-out infinite',
      },
      borderRadius: {
        'xl-lg': '12px',
        '2xl-sm': '16px',
      }
    },
  },
  plugins: [],
}
