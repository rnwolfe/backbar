/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warm-paper editorial palette — distinct from operator console's dense
        // dark. Shared accent (`copper`) is the only deliberate brand bridge.
        paper: "#f5efe4",
        "paper-2": "#ece3d2",
        ink: "#1f1a14",
        "ink-2": "#3b342a",
        "ink-3": "#766c5d",
        rule: "#c9bda5",
        copper: "#b87333",
      },
      fontFamily: {
        // Display serif for cover + drink names; humanist sans for the rest.
        // System-stack only — no web fonts (offline-friendly snapshot).
        display: [
          "ui-serif",
          "Georgia",
          "Cambria",
          "Times New Roman",
          "Times",
          "serif",
        ],
        body: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      letterSpacing: {
        widish: "0.08em",
      },
    },
  },
  plugins: [],
};
