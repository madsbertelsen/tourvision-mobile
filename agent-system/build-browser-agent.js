import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const watch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: [join(__dirname, 'browser-agent.ts')],
  bundle: true,
  outfile: join(__dirname, 'browser-agent-bundle.js'),
  platform: 'browser',
  format: 'iife',
  // Remove globalName so IIFE executes immediately
  target: 'es2020',
  sourcemap: true,
  minify: false, // Keep readable for debugging
  loader: {
    '.ts': 'ts',
    '.js': 'js'
  },
  external: [], // Bundle everything
  define: {
    'process.env.NODE_ENV': '"production"'
  },
  logLevel: 'info'
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('👀 Watching browser-agent.ts for changes...');
} else {
  await esbuild.build(buildOptions);
  console.log('✅ Browser agent built successfully');
}
