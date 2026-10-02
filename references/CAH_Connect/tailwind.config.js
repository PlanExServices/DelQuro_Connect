/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          burgundy: '#6B1D2F',
          burgundyDark: '#4A121F',
          burgundyLight: '#8A293E',
          burgundySoft: '#FDF2F4',
          navy: '#1B2A4A',
          navyDark: '#101C33',
          navyLight: '#2C4373',
          navySoft: '#F0F4FA',
          ice: '#E8F1F5',
          iceDark: '#C9DFEB',
          paleBlue: '#F4F8FA',
          gold: '#C89228',
          goldLight: '#FEF9E7',
          sage: '#2E7D32',
          sageSoft: '#EDF7EE',
          rose: '#C53030',
          roseSoft: '#FDF0F0',
          amber: '#C05621',
          amberSoft: '#FFF6E6'
        }
      },
      fontFamily: {
        serif: ['"Merriweather"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 2px 10px rgba(27, 42, 74, 0.06)',
        'medium': '0 4px 20px rgba(27, 42, 74, 0.10)',
        'elevated': '0 10px 30px rgba(107, 29, 47, 0.12)',
      }
    },
  },
  plugins: [],
}
