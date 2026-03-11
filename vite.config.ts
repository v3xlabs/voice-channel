import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import solidDevtools from "solid-devtools/vite";

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [solidDevtools(), solid(), tailwindcss()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  define: {
    global: {}
  }
}));
