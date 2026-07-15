import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// Only required for local dev server; Vercel's build step never touches these.
const rawPort = process.env.PORT ?? process.env.VITE_PORT ?? "5173";
const port = Number(rawPort);

function normalizeApiBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "").replace(/\/api$/, "");
}

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // Ensure dom-helpers subpath imports resolve correctly under pnpm layout
      "dom-helpers/addClass": path.resolve(import.meta.dirname, "..", "..", "node_modules", ".pnpm", "dom-helpers@5.2.1", "node_modules", "dom-helpers", "esm", "addClass.js"),
      "dom-helpers/removeClass": path.resolve(import.meta.dirname, "..", "..", "node_modules", ".pnpm", "dom-helpers@5.2.1", "node_modules", "dom-helpers", "esm", "removeClass.js"),
      "dom-helpers/hasClass": path.resolve(import.meta.dirname, "..", "..", "node_modules", ".pnpm", "dom-helpers@5.2.1", "node_modules", "dom-helpers", "esm", "hasClass.js"),
      "dom-helpers/contains": path.resolve(import.meta.dirname, "..", "..", "node_modules", ".pnpm", "dom-helpers@5.2.1", "node_modules", "dom-helpers", "esm", "contains.js"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      "/api": {
        target: (process.env.VITE_API_URL ?? "http://localhost:3001").replace(/\/$/, "").replace(/\/api$/, ""),
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
