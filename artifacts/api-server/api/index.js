// Vercel Serverless Function entrypoint for the standalone backend project.
// Root Directory for this Vercel project should be `artifacts/api-server`.
// Vercel auto-detects any file under `api/` as a serverless function, so
// this file becomes the handler for every request routed to it (see the
// rewrite in ../vercel.json that sends all paths here).
import app from '../dist/index.mjs';

export default async function handler(req, res) {
  // Express apps are callable directly as (req, res, next) middleware.
  return new Promise((resolve, reject) => {
    app(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
