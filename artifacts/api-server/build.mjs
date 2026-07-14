import { build } from 'esbuild';

await build({
  entryPoints: ['./src/index.ts'],
  bundle: true,
  outfile: './dist/index.mjs',
  platform: 'node',
  format: 'esm',
  sourcemap: false,
  target: 'node20',
  // Only exclude truly native/binary modules
  external: [
    'pg-native',
    'fsevents',
    '@mapbox/node-pre-gyp',
    'mock-aws-s3',
    'aws-sdk',
    'nock',
    'cpu-features',
    'ssh2',
  ],
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
});

console.log('✅ API server build complete');
