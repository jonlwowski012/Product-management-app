import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/index.js';
import { projects } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', (_req, res) => {
  const all = db.select().from(projects).all();
  res.json(all);
});

router.get('/:id', (req, res) => {
  const project = db.select().from(projects).where(eq(projects.id, req.params.id)).get();
  if (!project) return res.status(404).json({ message: 'Project not found' });
  res.json(project);
});

router.post('/', (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ message: 'Name is required' });

  const id = uuid();
  const now = new Date().toISOString();

  db.insert(projects).values({
    id,
    name,
    description: description || '',
    ownerId: req.session.userId!,
    createdAt: now,
    updatedAt: now,
  }).run();

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  res.status(201).json(project);
});

router.put('/:id', (req, res) => {
  const { name, description } = req.body;
  const now = new Date().toISOString();

  db.update(projects)
    .set({ name, description, updatedAt: now })
    .where(eq(projects.id, req.params.id))
    .run();

  const project = db.select().from(projects).where(eq(projects.id, req.params.id)).get();
  res.json(project);
});

router.delete('/:id', (req, res) => {
  db.delete(projects).where(eq(projects.id, req.params.id)).run();
  res.status(204).send();
});

export default router;
