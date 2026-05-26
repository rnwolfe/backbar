import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Guest UI is mobile-first and read-only. In dev + preview, the proxy points
// at the operator server's guest projection — `/api/guest/*` is the only
// thing this build is ever allowed to read (live menu plus the sanitized
// public share endpoints for recipes / products / bottles; no inventory
// internals).
const guestProxy = {
  "/api/guest": {
    target: "http://localhost:8787",
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/api\/guest/, "/guest"),
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: guestProxy,
  },
  preview: {
    port: 4173,
    proxy: guestProxy,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
