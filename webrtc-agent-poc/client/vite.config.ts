import { defineConfig, loadEnv, Plugin } from 'vite';
import { resolve } from 'path';

// Custom plugin to handle SPA routing for /doc/* paths
function spaFallback(): Plugin {
  return {
    name: 'spa-fallback',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Rewrite /doc/* requests to index.html for SPA routing
        if (req.url?.startsWith('/doc/')) {
          req.url = '/index.html';
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [spaFallback()],
    server: {
      port: 5173,
      host: 'localhost',
    },
    // Multi-page app configuration for build
    appType: 'mpa',
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          landing: resolve(__dirname, 'landing.html'),
        },
      },
    },
    // Expose environment variables to client code
    // Variables prefixed with VITE_ are automatically available
    define: {
      'import.meta.env.VITE_SIGNALING_URL': JSON.stringify(
        env.VITE_SIGNALING_URL || 'ws://localhost:8787/signaling'
      ),
    },
  };
});
