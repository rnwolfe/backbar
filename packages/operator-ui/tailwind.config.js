/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Console palette (mirrors console/tokens.ts so utility classes match runtime tokens)
        bg: "#0a0c0f",
        surface: "#0f1318",
        "surface-2": "#141921",
        "surface-3": "#1a2029",
        hairline: "#1c232d",
        "hairline-2": "#262f3c",
        ink: "#dbe2ec",
        "ink-muted": "#8794a6",
        "ink-dim": "#4a5566",
        "ink-vdim": "#2d3441",
        cyan: "#4ddae8",
        "cyan-dim": "#1d6b75",
        amber: "#e9a648",
        "amber-dim": "#6b4a14",
        green: "#62c97d",
        "green-dim": "#1f5a30",
        red: "#ec5a4d",
        // legacy aliases retained for older components during transition
        "fg": "#dbe2ec",
        "fg-2": "#8794a6",
        "fg-3": "#4a5566",
        "bg-2": "#0f1318",
        "bg-3": "#141921",
        "bg-4": "#1a2029",
        accent: "#4ddae8",
        "accent-2": "#4ddae8",
        warn: "#e9a648",
        danger: "#ec5a4d",
        ok: "#62c97d",
      },
      fontFamily: {
        sans: ['"Geist"', "system-ui", "-apple-system", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ['"Geist Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": "0.6875rem", // 11px
        "3xs": "0.625rem",  // 10px
      },
      letterSpacing: {
        wider2: "0.14em",
        widest2: "0.18em",
      },
    },
  },
  plugins: [],
};
