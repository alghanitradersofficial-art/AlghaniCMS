import express from 'express';
import cors from 'cors';
import router from './routes/index.js';

const app = express();

const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:4173']
  : ['http://localhost:5173', 'http://localhost:4173'];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) return cb(null, true);
    // allow vercel preview URLs
    if (origin.includes('.vercel.app') || origin.includes('vercel.app')) return cb(null, true);
    return cb(null, true); // open for now
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', router);

app.get('/', (_req, res) => {
  res.json({ message: 'Al Ghani ERP API', version: '2.0.0' });
});

export default app;
