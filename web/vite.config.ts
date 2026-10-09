import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * `public/posters` and `public/derivatives.json` are symlinks into
 * ../assets/posters/. The archive's images are project data, not app source, so
 * they live beside the harvest that produced them rather than inside the bundle.
 * Serving them from public/ keeps 59 posters x 15 derivatives out of the module
 * graph entirely: Vite copies them, it does not process them.
 */
export default defineConfig({
  plugins: [react()],
  server: { port: 5179, strictPort: true },
  build: { target: "es2022" },
});
