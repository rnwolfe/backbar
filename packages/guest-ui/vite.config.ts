import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Guest UI is mobile-first and read-only. In dev, the proxy points at the
// operator server's guest projection; `/api/guest/menu` is the only thing
// this build is ever allowed to read (no inventory internals).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api/guest": {
        target: "http://localhost:8787",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/guest/, "/guest"),
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
