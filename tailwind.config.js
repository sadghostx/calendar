/** @type {import('tailwindcss').Config} */
export default {
  content: [
    // This tells Tailwind to scan all files in src/ that end in .html, .js, .jsx, .ts, or .tsx
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", 
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
