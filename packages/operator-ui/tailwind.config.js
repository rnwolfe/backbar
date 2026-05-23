/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0d10",
        "bg-2": "#11151a",
        "bg-3": "#1a1f26",
        "bg-4": "#242b34",
        fg: "#e6edf3",
        "fg-2": "#9aa4b2",
        "fg-3": "#6b7480",
        accent: "#7dd3fc",
        "accent-2": "#38bdf8",
        warn: "#fbbf24",
        danger: "#f87171",
        ok: "#4ade80",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        "2xs": "0.6875rem",
      },
    },
  },
  plugins: [],
};
