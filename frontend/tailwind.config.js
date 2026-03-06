/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0a",
        cyan: "#00ffcc",
        amber: "#f59e0b",
        muted: "#3a3a3a",
        surface: "#111111",
        border: "#1f1f1f",
        text: "#e8e8e8",
        dim: "#666666",
      },
      fontFamily: {
        mono: ["Space Mono", "monospace"],
        sans: ["Syne", "sans-serif"],
      },
    },
  },
  plugins: [],
}