import app from './app.js';

const PORT = process.env.PORT || 3001;

// Only bind a port when actually running as a long-lived process
// (local dev / a traditional host). On Vercel this file is imported
// by api/index.js as a request handler instead, so we skip listen().
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Al Ghani ERP API running on port ${PORT}`);
  });
}

export default app;
