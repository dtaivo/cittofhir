import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: true },
  // La librería de Excel (~900 KB) se descarga aparte, solo al cargar una planilla.
  build: { chunkSizeWarningLimit: 1000 },
});
