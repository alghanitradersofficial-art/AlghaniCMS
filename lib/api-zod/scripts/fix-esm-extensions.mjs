// Adds explicit .js extensions to relative import/export specifiers in
// compiled output, so plain Node ESM (no bundler) can resolve them.
// Needed because this package compiles with moduleResolution "bundler",
// which does not require/emit extensions, but Node's ESM loader does.
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

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
