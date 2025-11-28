import { defineConfig, loadEnv, Plugin } from 'vite';
import { resolve } from 'path';

// Custom plugin to handle routing
function routingPlugin(): Plugin {
  return {
    name: 'routing-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Serve landing.html at root
        if (req.url === '/' || req.url === '/index.html') {
          req.url = '/landing.html';
        }
        // Rewrite /doc/* requests to index.html for SPA routing (editor app)
        else if (req.url?.startsWith('/doc/')) {
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
    plugins: [routingPlugin()],
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
