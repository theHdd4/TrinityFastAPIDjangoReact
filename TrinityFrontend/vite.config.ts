import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Check both NODE_ENV and mode to determine if we're in production
  // Mode is the primary source of truth (from --mode flag), NODE_ENV is fallback
  const isProduction = mode === 'production' || (mode !== 'development' && process.env.NODE_ENV === 'production');

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    esbuild: {
      // Remove console.log, console.warn, and console.error in production
      drop: isProduction ? ['console', 'debugger'] : [],
    },
    build: {
      // Additional production optimizations
      minify: 'esbuild',
      sourcemap: false,
    },
  };
});
