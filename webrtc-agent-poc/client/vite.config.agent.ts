import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory
  const env = loadEnv(mode, process.cwd(), '');

  return {
    server: {
      port: 5173,
      host: 'localhost',
    },
    build: {
      outDir: 'dist-agent',
      sourcemap: true,
    },
    // Expose environment variables to client code
    // Variables prefixed with VITE_ are automatically available
    define: {
      'import.meta.env.VITE_SIGNALING_URL': JSON.stringify(
        env.VITE_SIGNALING_URL || 'ws://localhost:8787/signaling'
      ),
      'import.meta.env.VITE_BUILD_MODE': JSON.stringify('agent'),
    },
  };
});
