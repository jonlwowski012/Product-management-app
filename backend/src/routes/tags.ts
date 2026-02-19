import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/index.js';
import { tags } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/project/:projectId', (req, res) => {
  const all = db.select().from(tags).where(eq(tags.projectId, req.params.projectId)).all();
  res.json(all);
});

router.post('/', (req, res) => {
  const { projectId, name, color } = req.body;
  if (!projectId || !name) return res.status(400).json({ message: 'projectId and name are required' });

  const id = uuid();
  db.insert(tags).values({ id, projectId, name, color: color || '#3b82f6' }).run();

  const tag = db.select().from(tags).where(eq(tags.id, id)).get();
  res.status(201).json(tag);
});

router.delete('/:id', (req, res) => {
  db.delete(tags).where(eq(tags.id, req.params.id)).run();
  res.status(204).send();
});

export default router;
