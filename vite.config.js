import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          pdf: ["jspdf"],
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    open: false,
    hmr: {
      protocol: "ws",
      host: "127.0.0.1",
      port: 5173,
      clientPort: 5173,
    },
    watch: {
      usePolling: true,
      interval: 1000,
    },
  },
  preview: {
    port: 4173,
  },
});
