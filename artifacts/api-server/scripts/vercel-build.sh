#!/bin/sh
set -e

# Build the workspace dependencies (@workspace/api-zod, @workspace/db).
pnpm --filter @workspace/api-zod --filter @workspace/db run build

# pnpm links workspace deps into node_modules as symlinks pointing outside
# this project's Root Directory (e.g. ../../lib/api-zod). Vercel's function
# bundler/tracer only has visibility into files inside the Root Directory,
# so it can't follow those symlinks. Replace them with real, physical
# copies so the built packages live inside the Root Directory itself.
rm -rf node_modules/@workspace/api-zod node_modules/@workspace/db
mkdir -p node_modules/@workspace
cp -RL ../../lib/api-zod node_modules/@workspace/api-zod
cp -RL ../../lib/db node_modules/@workspace/db

# `cp -RL` dereferences the `node_modules/pg` symlink itself, but pnpm keeps
# pg's own dependencies (pg-types, pg-protocol, ...) as SIBLING entries in
# its virtual store rather than nested inside pg's own folder. Those
# siblings never get copied, so once `pg` is physically relocated above,
# its internal `require('pg-types')` etc. can no longer walk up to find
# them — this is what previously crashed the deployed function with
# "Cannot find module 'pg-types'". Resolve each of pg's real dependencies
# from the original (still-correctly-linked) lib/db location and copy the
# real, resolved directories in as siblings of the relocated pg package.
node -e "
  const fs = require('fs');
  const path = require('path');
  const { execSync } = require('child_process');

  const pgDeps = ['pg-connection-string', 'pg-pool', 'pg-protocol', 'pg-types', 'pgpass', 'pg-cloudflare'];
  const originalDb = path.resolve('../../lib/db');
  const destNodeModules = path.resolve('node_modules/@workspace/db/node_modules');

  for (const dep of pgDeps) {
    const destDir = path.join(destNodeModules, dep);
    if (fs.existsSync(destDir)) continue; // already a real copy, nothing to do
    let resolvedPkgJson;
    try {
      resolvedPkgJson = require.resolve(dep + '/package.json', { paths: [originalDb] });
    } catch (err) {
      continue; // optional dep (e.g. pg-cloudflare) not installed — fine to skip
    }
    const srcDir = path.dirname(resolvedPkgJson);
    fs.mkdirSync(destNodeModules, { recursive: true });
    execSync('cp -RL ' + JSON.stringify(srcDir) + ' ' + JSON.stringify(destDir));
    console.log('[vercel-build] copied missing pg dependency:', dep);
  }
"

