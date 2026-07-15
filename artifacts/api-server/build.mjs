import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import fs from "node:fs";
import { rm } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  // Build with the repository root as the working directory so workspace packages
  // (e.g. lib/api-zod) are resolved and bundled into the output instead of
  // referencing files outside `dist`.
  const repoRoot = path.resolve(artifactDir, "..", "..");

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    absWorkingDir: repoRoot,
    logLevel: "info",
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      "*.node",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] }),
      // Resolve workspace packages to their built `dist` output in the monorepo.
      // This ensures esbuild running on CI (Vercel) finds the compiled files
      // produced by the earlier `pnpm --filter ... run build` step.
      {
        name: 'workspace-resolve',
        setup(build) {
          const workspaceRegex = /^@workspace\/(.+?)(?:\/(.*))?$/;
          build.onResolve({ filter: workspaceRegex }, (args) => {
            const m = args.path.match(workspaceRegex);
            if (!m) return;
            const pkg = m[1];
            const subpath = m[2];
            const distRoot = path.resolve(repoRoot, 'lib', pkg, 'dist');

            const candidates = [];
            if (subpath) {
              const base = path.join(distRoot, subpath);
              candidates.push(base);
              candidates.push(base + '.js');
              candidates.push(base + '.mjs');
              candidates.push(path.join(base, 'index.js'));
              candidates.push(path.join(base, 'index.mjs'));
            } else {
              candidates.push(path.join(distRoot, 'index.js'));
              candidates.push(path.join(distRoot, 'index.mjs'));
              candidates.push(path.join(distRoot, 'index.cjs'));
              candidates.push(path.join(distRoot, 'index.ts'));
            }

            for (const c of candidates) {
              try {
                if (fs.existsSync(c) && fs.statSync(c).isFile()) {
                  return { path: c };
                }
              } catch (e) {
                // ignore and continue
              }
            }

            // fallback: return original path so esbuild can try default resolution or report a helpful message
            return { path: path.join(distRoot, subpath || '') };
          });
        }
      }
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
