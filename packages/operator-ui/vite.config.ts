import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string };
const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");

export default defineConfig({
  plugins: [react()],
  define: {
    __BACKBAR_VERSION__: JSON.stringify(pkg.version),
    __BACKBAR_CHANGELOG__: JSON.stringify(changelog),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
      "/live": {
        target: "ws://localhost:8787",
        ws: true,
      },
    },
  },
});
