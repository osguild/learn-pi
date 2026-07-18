import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: Vite on :5173 proxies /api to the standalone API server on :7331
// (run via `pnpm dashboard:dev` from the repo root, which boots both).
// Build: emits static assets to dashboard/dist, served at runtime by
// lib/dashboard.ts (one Node http server, no Vite at runtime).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:7331",
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
