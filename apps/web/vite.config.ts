import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // AG Grid ships as one ~800 kB chunk, loaded only on the Spending tab.
  build: { chunkSizeWarningLimit: 900 },
  server: { port: 5190, strictPort: true, proxy: { "/api": "http://localhost:8080" } },
});
