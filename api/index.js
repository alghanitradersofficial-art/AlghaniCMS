import app from '../artifacts/api-server/dist/index.mjs';

// Export a handler compatible with Vercel's Node runtime.
export default function handler(req, res) {
  return app(req, res);
}
