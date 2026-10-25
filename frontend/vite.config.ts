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
  // No source maps in the build: they would publish the site's readable
  // source to anyone (2026-10-22 review). Development (Vite) has its own.
  // The manifest names which built files the sign-in page needs; the
  // server sends only those to somebody not signed in (owner
  // 2026-10-24), and reads it from disk -- it is never served.
  // Files are named by their hash alone, so the sign-in page's code,
  // which has to name the other pages' files, names nothing readable.
  build: {
    outDir: "dist",
    sourcemap: false,
    manifest: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[hash].js",
        chunkFileNames: "assets/[hash].js",
        assetFileNames: "assets/[hash][extname]",
      },
    },
  },
  test: {
    // Node by default: the logic modules are deliberately DOM-free
    // and must stay runnable without one. Component tests opt into
    // jsdom with a `@vitest-environment jsdom` docblock.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["src/test-setup.ts"],
  },
});
