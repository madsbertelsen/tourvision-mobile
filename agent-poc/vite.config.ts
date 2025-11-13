import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    cloudflare({
      configPath: "./wrangler.toml",
      persist: { path: "./.wrangler/state" }
    }),
    tailwindcss()
  ]
});
