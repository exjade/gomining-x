/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  important: '.pouw-landing-root',
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        // PouwMiner Brand Colors — verified from gomining-x/src/styles.css
        bg: {
          base: '#090b14',
          panel: '#111420',
          elevated: '#171a28',
        },
        purple: {
          400: '#b47bff',
          500: '#874bff',
          600: '#8b5cf6',
          700: '#7c3aed',
          800: '#6d28d9',
          900: '#4c1d95',
        },
        green: {
          accent: '#4fdfa6',
        },
        text: {
          primary: '#f5f5fb',
          muted: '#8a8ea4',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Cal Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'gradient-purple': 'linear-gradient(135deg, #a94eff 0%, #713cff 100%)',
        'gradient-violet': 'linear-gradient(135deg, #7845ef 0%, #9754ff 100%)',
        'gradient-dark': 'linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)',
        'aurora': 'radial-gradient(ellipse at 20% 50%, rgba(135,75,255,0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(124,58,237,0.1) 0%, transparent 50%)',
      },
      animation: {
        'pulse-purple': 'pulse-purple 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'ticker': 'ticker 20s linear infinite',
      },
      keyframes: {
        'pulse-purple': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 20px rgba(135, 75, 255, 0.5)' },
          '50%': { opacity: '0.7', boxShadow: '0 0 40px rgba(135, 75, 255, 0.8)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        'glow': {
          'from': { boxShadow: '0 0 20px rgba(135, 75, 255, 0.3)' },
          'to': { boxShadow: '0 0 60px rgba(169, 78, 255, 0.6)' },
        },
        'ticker': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
