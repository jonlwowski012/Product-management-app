import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/register', async (req, res) => {
  try {
    const { email, name, password, role } = req.body;
    if (!email || !name || !password) {
      return res.status(400).json({ message: 'Email, name, and password are required' });
    }

    const existing = db.select().from(users).where(eq(users.email, email)).get();
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const id = uuid();
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();

    db.insert(users).values({
      id,
      email,
      name,
      passwordHash,
      role: role || 'pm',
      createdAt: now,
    }).run();

    req.session.userId = id;
    res.status(201).json({ id, email, name, role: role || 'pm', createdAt: now });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = db.select().from(users).where(eq(users.email, email)).get();
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    req.session.userId = user.id;
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.status(204).send();
  });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.select().from(users).where(eq(users.id, req.session.userId!)).get();
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt });
});

router.get('/users', requireAuth, (_req, res) => {
  const allUsers = db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    role: users.role,
    createdAt: users.createdAt,
  }).from(users).all();
  res.json(allUsers);
});

export default router;
