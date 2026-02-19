import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/index.js';
import { comments, users } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/feature/:featureId', (req, res) => {
  const featureComments = db
    .select({
      id: comments.id,
      featureId: comments.featureId,
      phaseNumber: comments.phaseNumber,
      userId: comments.userId,
      userName: users.name,
      content: comments.content,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.featureId, req.params.featureId))
    .all();

  res.json(featureComments);
});

router.post('/', (req, res) => {
  const { featureId, phaseNumber, content } = req.body;
  if (!featureId || !content) return res.status(400).json({ message: 'featureId and content are required' });

  const id = uuid();
  const now = new Date().toISOString();

  db.insert(comments).values({
    id,
    featureId,
    phaseNumber: phaseNumber || null,
    userId: req.session.userId!,
    content,
    createdAt: now,
  }).run();

  const user = db.select({ name: users.name }).from(users).where(eq(users.id, req.session.userId!)).get();

  res.status(201).json({
    id,
    featureId,
    phaseNumber: phaseNumber || null,
    userId: req.session.userId,
    userName: user?.name || '',
    content,
    createdAt: now,
  });
});

router.delete('/:id', (req, res) => {
  db.delete(comments).where(eq(comments.id, req.params.id)).run();
  res.status(204).send();
});

export default router;
