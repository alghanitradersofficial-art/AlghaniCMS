// Vercel Serverless Function — routes all /api/* requests to Express app
import app from '../artifacts/api-server/dist/index.mjs';

export default async function handler(req, res) {
  // Express apps are callable as middleware
  return new Promise((resolve, reject) => {
    app(req, res, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
