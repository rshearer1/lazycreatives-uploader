import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" so the packaged renderer loads its assets over file:// correctly.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  test: { environment: "jsdom" },
});
