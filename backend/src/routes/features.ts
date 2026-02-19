import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/index.js';
import { features, phaseData, users, tags, featureTags } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { computePriorityScore } from '../utils/scoring.js';

const router = Router();

router.use(requireAuth);

router.get('/project/:projectId', (req, res) => {
  const allFeatures = db.select().from(features).where(eq(features.projectId, req.params.projectId)).all();

  const enriched = allFeatures.map((f) => {
    const assignee = f.assigneeId
      ? db.select({ name: users.name }).from(users).where(eq(users.id, f.assigneeId)).get()
      : null;
    const fTags = db
      .select({ id: tags.id, name: tags.name, color: tags.color, projectId: tags.projectId })
      .from(featureTags)
      .innerJoin(tags, eq(featureTags.tagId, tags.id))
      .where(eq(featureTags.featureId, f.id))
      .all();
    return { ...f, assigneeName: assignee?.name || null, tags: fTags };
  });

  res.json(enriched);
});

router.get('/:id', (req, res) => {
  const feature = db.select().from(features).where(eq(features.id, req.params.id)).get();
  if (!feature) return res.status(404).json({ message: 'Feature not found' });

  const phases = db.select().from(phaseData).where(eq(phaseData.featureId, feature.id)).all();
  const parsedPhases = phases.map((p) => ({ ...p, data: JSON.parse(p.data) }));

  const assignee = feature.assigneeId
    ? db.select({ name: users.name }).from(users).where(eq(users.id, feature.assigneeId)).get()
    : null;

  const fTags = db
    .select({ id: tags.id, name: tags.name, color: tags.color, projectId: tags.projectId })
    .from(featureTags)
    .innerJoin(tags, eq(featureTags.tagId, tags.id))
    .where(eq(featureTags.featureId, feature.id))
    .all();

  res.json({ ...feature, assigneeName: assignee?.name || null, phases: parsedPhases, tags: fTags });
});

router.post('/', (req, res) => {
  const { projectId, title, description, assigneeId } = req.body;
  if (!projectId || !title) return res.status(400).json({ message: 'projectId and title are required' });

  const id = uuid();
  const now = new Date().toISOString();

  db.insert(features).values({
    id,
    projectId,
    title,
    description: description || '',
    status: 'draft',
    currentPhase: 1,
    assigneeId: assigneeId || null,
    createdBy: req.session.userId!,
    createdAt: now,
    updatedAt: now,
  }).run();

  // Create phase_data rows for all 9 phases
  for (let i = 1; i <= 9; i++) {
    db.insert(phaseData).values({
      id: uuid(),
      featureId: id,
      phaseNumber: i,
      status: i === 1 ? 'in_progress' : 'not_started',
      data: '{}',
    }).run();
  }

  const feature = db.select().from(features).where(eq(features.id, id)).get();
  res.status(201).json(feature);
});

router.put('/:id', (req, res) => {
  const { title, description, status, currentPhase, assigneeId } = req.body;
  const now = new Date().toISOString();

  const updates: Record<string, unknown> = { updatedAt: now };
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;
  if (currentPhase !== undefined) updates.currentPhase = currentPhase;
  if (assigneeId !== undefined) updates.assigneeId = assigneeId;

  db.update(features).set(updates).where(eq(features.id, req.params.id)).run();

  const feature = db.select().from(features).where(eq(features.id, req.params.id)).get();
  res.json(feature);
});

router.delete('/:id', (req, res) => {
  db.delete(features).where(eq(features.id, req.params.id)).run();
  res.status(204).send();
});

// Recalculate priority score
router.post('/:id/score', (req, res) => {
  const phases = db.select().from(phaseData).where(eq(phaseData.featureId, req.params.id)).all();
  const phaseMap: Record<number, Record<string, unknown>> = {};
  for (const p of phases) {
    phaseMap[p.phaseNumber] = JSON.parse(p.data);
  }

  const score = computePriorityScore(phaseMap);
  const now = new Date().toISOString();

  db.update(features)
    .set({ priorityScore: score, updatedAt: now })
    .where(eq(features.id, req.params.id))
    .run();

  res.json({ priorityScore: score });
});

// Tags management for a feature
router.post('/:id/tags', (req, res) => {
  const { tagId } = req.body;
  if (!tagId) return res.status(400).json({ message: 'tagId is required' });

  db.insert(featureTags).values({ featureId: req.params.id, tagId }).run();
  res.status(201).json({ featureId: req.params.id, tagId });
});

router.delete('/:id/tags/:tagId', (req, res) => {
  db.delete(featureTags)
    .where(and(eq(featureTags.featureId, req.params.id), eq(featureTags.tagId, req.params.tagId)))
    .run();
  res.status(204).send();
});

export default router;
