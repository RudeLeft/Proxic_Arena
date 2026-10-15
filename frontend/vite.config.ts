import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// PHASE_01 1.28: in development Vite proxies /api and /ws to Ktor, so
// the browser talks to one origin and no CORS config is needed. In
// PRODUCTION Vite does not run at all -- Ktor serves the built static
// files (1.27).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: true },
      "/ws": { target: "ws://localhost:8080", ws: true },
    },
  },
  build: { outDir: "dist", sourcemap: true },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
