import { defineConfig } from "vite";

// base "./" makes the built app work under a GitHub Pages sub-path
// (https://<user>.github.io/<repo>/) as well as at the root.
export default defineConfig({
  base: "./",
});
