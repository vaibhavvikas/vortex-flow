import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules")) {
            if (id.includes("@xyflow") || id.includes("@dagrejs")) {
              return "vendor-flow";
            }
            if (id.includes("@base-ui") || id.includes("lucide-react")) {
              return "vendor-ui";
            }
            if (id.includes("react-dom") || id.includes("@tanstack")) {
              return "vendor-core";
            }
          }
        },
      },
    },
  },
});