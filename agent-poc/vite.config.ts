import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig(({ mode }) => ({
  plugins: [
    cloudflare({
      configPath: "./wrangler.toml",
      persist: { path: "./.wrangler/state" },
      environment: mode === 'production' ? 'production' : undefined
    }),
    tailwindcss()
  ],
  publicDir: 'public',  // Copy public folder to dist during build
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        map: resolve(__dirname, 'map.html')
      }
    }
  },
  server: {
    host: true,  // Expose to LAN (0.0.0.0)
    port: 5174,
    cors: {
      origin: '*',  // Allow any origin for development
      credentials: true
    },
    allowedHosts: [
      'localhost',
      '192.168.1.223',
      'dev.tourvision.com',
      'yjs.tourvision.com',
      'db.tourvision.com'
    ]
  }
}));
