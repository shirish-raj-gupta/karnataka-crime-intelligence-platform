import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Vite builds into the Catalyst client/ directory (which holds client-package.json).
// In dev, /server/crime_api is proxied to the locally served Advanced I/O function,
// so the app uses the SAME API path in dev and production.
export default defineConfig({
  plugins: [react()],
  // Use relative asset paths. Catalyst Web Client Hosting serves the app under
  // an /app/ subpath, so absolute "/assets/..." references 404. "./" makes
  // asset URLs relative to index.html and work under any base path.
  base: "./",
  build: {
    outDir: resolve(__dirname, "../client"),
    emptyOutDir: false, // preserve client-package.json
  },
  server: {
    port: 5173,
    proxy: {
      "/server/crime_api": {
        target: "http://localhost:9000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/server\/crime_api/, ""),
      },
    },
  },
});
