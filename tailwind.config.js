/** @type {import('tailwindcss').Config} */
// NativeWind / Tailwind config for Mutual Mesh.
// Tokens MUST stay in sync with src/lib/theme.ts. The contrast ratios in
// DESIGN.md were calculated against the values below; if you change a value
// here, update both DESIGN.md and Alex's audit accordingly.
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        light: {
          bg: '#F7F3EE',
          surface: '#FFFFFF',
          text: '#1A1916',
          'text-secondary': '#4A3D2C',
          'text-muted': '#6B5640',
          border: '#D9CBBA',
          'border-strong': '#8B6F4E',
          accent: '#1F7A6A',
          'accent-text': '#FFFFFF',
          success: '#3F6B33',
          warning: '#8A5A1F',
          danger: '#8C2D2D',
        },
        dark: {
          bg: '#0E0D0B',
          surface: '#1A1916',
          text: '#F5F2EE',
          'text-secondary': '#D9CBBA',
          'text-muted': '#A8957D',
          border: '#2E2218',
          'border-strong': '#8A7659',
          accent: '#4FBFA8',
          'accent-text': '#0E0D0B',
          success: '#88BC73',
          warning: '#DBA951',
          danger: '#E07878',
        },
      },
      fontFamily: {
        sans: ['System'],
      },
      borderRadius: {
        card: '12px',
        button: '8px',
      },
    },
  },
  plugins: [],
};
