import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  optimizeDeps: {
    exclude: ["cubing"],
  },
  worker: {
    format: "es",
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        learn: resolve(__dirname, "learn.html"),
      },
    },
  },
});
