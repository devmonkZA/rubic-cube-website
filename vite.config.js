import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: ["cubing"],
  },
  worker: {
    format: "es",
  },
});
