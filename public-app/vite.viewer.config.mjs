import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist-viewer",
    sourcemap: false,
    rollupOptions: {
      input: {
        index: resolve(rootDir, "viewer.html"),
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    warmup: {
      clientFiles: ["./src/viewerMain.jsx"],
    },
  },
  plugins: [react()],
});
