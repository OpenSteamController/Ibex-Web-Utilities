import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  base: "/Ibex-Web-Utilities/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@lib": path.resolve(__dirname, "../src"),
    },
  },
});
