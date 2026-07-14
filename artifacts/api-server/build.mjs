import { build } from 'esbuild';

await build({
  entryPoints: ['./src/index.ts'],
  bundle: true,
  outfile: './dist/index.mjs',
  platform: 'node',
  format: 'esm',
  sourcemap: true,
  target: 'node22',
  external: [
    'pg-native',
    'fsevents',
    'form-data',
    '@mapbox/node-pre-gyp',
    'mock-aws-s3',
    'aws-sdk',
    'nock',
    'node-telegram-bot-api',
  ],
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
});

console.log('✅ API server build complete');
