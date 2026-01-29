/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,html}",
  ],
  theme: {
    extend: {
      colors: {
        pocket: {
          green: '#00c853',
          red: '#ff1744',
          dark: '#1a1a2e',
          darker: '#0f0f1a',
        }
      }
    },
  },
  plugins: [],
}
