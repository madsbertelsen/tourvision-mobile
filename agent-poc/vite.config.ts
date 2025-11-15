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
  ],
  server: {
    host: true,  // Expose to LAN (0.0.0.0)
    port: 5174,
    cors: {
      origin: '*',  // Allow any origin for development
      credentials: true
    }
  }
});
