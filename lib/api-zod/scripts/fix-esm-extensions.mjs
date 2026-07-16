// Adds explicit .js extensions to relative import/export specifiers in
// compiled output, so plain Node ESM (no bundler) can resolve them.
// Needed because this package compiles with moduleResolution "bundler",
// which does not require/emit extensions, but Node's ESM loader does.
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

if (!existsSync(distDir)) {
  // This means `tsc` ran but didn't actually emit anything — almost always
  // because a stale committed .tsbuildinfo told it the output was already
  // up to date on a fresh checkout that has no dist/ at all. Fail loudly
  // with the real cause instead of a raw ENOENT stack trace.
  console.error(
    `[fix-esm-extensions] dist/ not found at ${distDir}.\n` +
    `tsc reported success but produced no output — this usually means a stale ` +
    `*.tsbuildinfo file was committed to the repo. Delete lib/api-zod/tsconfig.build.tsbuildinfo ` +
    `(and any other committed *.tsbuildinfo files) and add "*.tsbuildinfo" to .gitignore.`,
  );
  process.exit(1);
}

const specifierRe = /((?:from|import)\s+['"])(\.[^'"]+)(['"])/g;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walk(full);
    } else if (entry.endsWith('.js')) {
      fixFile(full);
    }
  }
}

function fixFile(filePath) {
  const original = readFileSync(filePath, 'utf8');
  const fixed = original.replace(specifierRe, (match, pre, spec, post) => {
    if (/\.[a-zA-Z0-9]+$/.test(spec)) return match; // already has an extension
    return `${pre}${spec}.js${post}`;
  });
  if (fixed !== original) {
    writeFileSync(filePath, fixed);
  }
}

walk(distDir);
console.log('Fixed relative ESM import/export extensions in dist/');
