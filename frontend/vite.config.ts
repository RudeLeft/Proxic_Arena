/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { earlyFilesOf, isManaPicture } from "./src/earlyPages";

/**
 * P11-E5 -- each signed-in page's built files, written into index.html (a
 * data block, never run) so a page with a session hint can fetch them beside
 * "who am I" (src/early.ts). The same page for everybody: the entry already
 * names every one of these files, and a stranger who asks for one is refused.
 */
function earlyFiles(): Plugin {
  return {
    name: "proxic-early-files",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        const chunks = Object.values(bundle).flatMap((out) =>
          out.type === "chunk"
            ? [
                {
                  fileName: out.fileName,
                  isEntry: out.isEntry,
                  imports: out.imports,
                  moduleIds: out.moduleIds,
                  css: [...(out.viteMetadata?.importedCss ?? [])],
                },
              ]
            : [],
        );
        // File names are hashes (build.rollupOptions.output below): no "<" to escape.
        const json = JSON.stringify(earlyFilesOf(chunks));
        return {
          html,
          tags: [
            {
              tag: "script",
              attrs: { type: "application/json", id: "pa-early" },
              children: json,
              injectTo: "head",
            },
          ],
        };
      },
    },
  };
}

// PHASE_01 1.28: in development Vite proxies /api and /ws to Ktor, so
// the browser talks to one origin and no CORS config is needed. The Host
// is passed through unchanged (no changeOrigin): the server accepts a
// change whose Origin matches the Host it was sent to, and rewriting
// Host to :8080 made every sign-in from :5173 a 403 BAD_ORIGIN
// (2026-11-04). In
// PRODUCTION Vite does not run at all -- Ktor serves the built static
// files (1.27).
export default defineConfig({
  plugins: [react(), earlyFiles()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8080" },
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
    // P11-E6: the mana symbols' pictures are files, never text inside the
    // board's code (src/battlefield/manaPictures.ts). Everything else keeps
    // Vite's own rule (inlined under 4 KB).
    assetsInlineLimit: (file) => (isManaPicture(file) ? false : undefined),
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
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tools/**/*.test.ts"],
    setupFiles: ["src/test-setup.ts"],
  },
});
