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
