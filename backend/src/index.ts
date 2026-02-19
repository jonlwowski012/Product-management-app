import express from 'express';
import cors from 'cors';
import session from 'express-session';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import featureRoutes from './routes/features.js';
import phaseRoutes from './routes/phases.js';
import commentRoutes from './routes/comments.js';
import tagRoutes from './routes/tags.js';

// Initialize database
import './db/index.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'ai-feature-prioritization-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/features', featureRoutes);
app.use('/api/phases', phaseRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/tags', tagRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
