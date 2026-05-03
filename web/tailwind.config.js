/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        card: {
          bg: 'var(--card-bg)',
        },
        brand: {
          orange:        'var(--brand-orange)',
          'orange-light':'var(--brand-orange-light)',
          'orange-dark': 'var(--brand-orange-dark)',
          navy:          'var(--brand-navy)',
          'blue-light':  'var(--brand-blue-light)',
        },
        warm: {
          50:  '#f9f8f6',
          100: '#f1ede4',
          200: '#e0ddd7',
          300: '#d3d1c7',
          400: '#b4b2a9',
          500: '#888880',
          900: '#1a1a1a',
          dark: {
            50:  '#1e1d1b',
            100: '#252320',
            200: '#2e2c28',
            300: '#3a3832',
            400: '#807e76',
            500: '#a8a59e',
          },
        },
        disc: {
          bg2:    '#1e1e1e',  // card / container  (VSCode editor bg)
          header: '#252526',  // table header row  (VSCode sidebar)
          hover:  '#2a2d2e',  // row hover + expanded panel
          border: '#3e3e3e',  // dividers
          text:   '#d4d4d4',  // primary text
          muted:  '#858585',  // secondary / label text
        },
        orange: {
          DEFAULT: 'var(--brand-orange)',
          light:   'var(--brand-orange-light)',
          dark:    'var(--brand-orange-dark)',
        },
        teal: {
          DEFAULT: 'var(--brand-orange)',
          light:   '#fff0e6',
          dark:    'var(--brand-orange-dark)',
          dim:     '#7c2d12',
          bright:  '#fdba74',
        },
        tier: {
          a: { bg: '#ead3ce', text: '#714b2b', dark: { bg: '#3d2318', text: '#d4a48a' } },
          b: { bg: '#cce5f4', text: '#0c447c', dark: { bg: '#0c2640', text: '#7bbfec' } },
          c: { bg: '#faeeda', text: '#854f0b', dark: { bg: '#3a2308', text: '#d4953e' } },
          d: { bg: '#fcebeb', text: '#a32d2d', dark: { bg: '#3a1212', text: '#d47373' } },
        },
      },
    },
  },
  plugins: [],
}
