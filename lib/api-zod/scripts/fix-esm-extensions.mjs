// Node's ESM loader requires explicit file extensions on relative
// import/export specifiers at runtime. Our source (particularly the
// orval-generated files under src/generated/types/) uses extensionless
// relative specifiers like `export * from './activityItem'`, which
// TypeScript happily emits as-is when compiling with "module": "ESNext".
// That compiles and type-checks fine (moduleResolution: "bundler" doesn't
// require extensions), but fails at runtime in plain Node with
// ERR_MODULE_NOT_FOUND, since Node's resolver does not do extension
// probing for relative specifiers.
//
// This script walks the compiled dist/ output and rewrites relative
// specifiers so they point at a concrete .js file (or an index.js inside
// a directory), after the TypeScript compiler has already run.

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(scriptDir, "..", "dist");

const SPECIFIER_RE =
  /((?:import|export)(?:[^'"]*?from)?\s*['"])(\.\.?\/[^'"]*)(['"])/g;
const DYNAMIC_IMPORT_RE = /(import\(\s*['"])(\.\.?\/[^'"]*)(['"]\s*\))/g;

async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveSpecifier(fromFile, specifier) {
  // Already has a recognized extension — leave it alone.
  if (/\.(m?js|json|cjs)$/.test(specifier)) return specifier;

  const baseDir = path.dirname(fromFile);
  const asFile = path.resolve(baseDir, `${specifier}.js`);
  const asIndex = path.resolve(baseDir, specifier, "index.js");

  if (await pathExists(asFile)) return `${specifier}.js`;
  if (await pathExists(asIndex)) {
    return specifier.endsWith("/") ? `${specifier}index.js` : `${specifier}/index.js`;
  }

  // Fall back to the naive .js suffix; better than leaving it broken.
  return `${specifier}.js`;
}

async function fixFile(filePath) {
  const original = await readFile(filePath, "utf8");
  let changed = false;
  let result = original;

  for (const re of [SPECIFIER_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0;
    const matches = [...result.matchAll(re)];
    for (const match of matches) {
      const [full, prefix, specifier, suffix] = match;
      const fixed = await resolveSpecifier(filePath, specifier);
      if (fixed !== specifier) {
        result = result.replace(full, `${prefix}${fixed}${suffix}`);
        changed = true;
      }
    }
  }

  if (changed) {
    await writeFile(filePath, result, "utf8");
  }
  return changed;
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  if (!(await pathExists(distDir))) {
    console.error(`[fix-esm-extensions] dist/ not found at ${distDir}.`);
    process.exit(1);
  }

  const files = await walk(distDir);
  let fixedCount = 0;
  for (const file of files) {
    if (await fixFile(file)) fixedCount++;
  }
  console.log(
    `[fix-esm-extensions] rewrote relative import extensions in ${fixedCount}/${files.length} file(s).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
