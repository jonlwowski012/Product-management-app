import { Router } from 'express';
import { db } from '../db/index.js';
import { phaseData, features } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { computePriorityScore } from '../utils/scoring.js';

const router = Router();

router.use(requireAuth);

// Get all phases for a feature
router.get('/feature/:featureId', (req, res) => {
  const phases = db.select().from(phaseData).where(eq(phaseData.featureId, req.params.featureId)).all();
  const parsed = phases.map((p) => ({ ...p, data: JSON.parse(p.data) }));
  res.json(parsed);
});

// Get specific phase for a feature
router.get('/feature/:featureId/:phaseNumber', (req, res) => {
  const phase = db
    .select()
    .from(phaseData)
    .where(
      and(
        eq(phaseData.featureId, req.params.featureId),
        eq(phaseData.phaseNumber, parseInt(req.params.phaseNumber))
      )
    )
    .get();

  if (!phase) return res.status(404).json({ message: 'Phase not found' });
  res.json({ ...phase, data: JSON.parse(phase.data) });
});

// Update phase data
router.put('/feature/:featureId/:phaseNumber', (req, res) => {
  const { data, status } = req.body;
  const phaseNum = parseInt(req.params.phaseNumber);
  const featureId = req.params.featureId;

  const updates: Record<string, unknown> = {};
  if (data !== undefined) updates.data = JSON.stringify(data);
  if (status !== undefined) {
    updates.status = status;
    if (status === 'completed') {
      updates.completedAt = new Date().toISOString();
      updates.completedBy = req.session.userId!;
    }
  }

  db.update(phaseData)
    .set(updates)
    .where(and(eq(phaseData.featureId, featureId), eq(phaseData.phaseNumber, phaseNum)))
    .run();

  // If completing a phase, advance the feature's currentPhase
  if (status === 'completed' && phaseNum < 9) {
    const nextPhaseNum = phaseNum + 1;

    db.update(features)
      .set({ currentPhase: nextPhaseNum, status: 'in_progress', updatedAt: new Date().toISOString() })
      .where(eq(features.id, featureId))
      .run();

    // Set next phase to in_progress
    db.update(phaseData)
      .set({ status: 'in_progress' })
      .where(and(eq(phaseData.featureId, featureId), eq(phaseData.phaseNumber, nextPhaseNum)))
      .run();
  }

  // If completing phase 9, mark feature as completed and recalculate score
  if (status === 'completed' && phaseNum === 9) {
    const allPhases = db.select().from(phaseData).where(eq(phaseData.featureId, featureId)).all();
    const phaseMap: Record<number, Record<string, unknown>> = {};
    for (const p of allPhases) {
      phaseMap[p.phaseNumber] = JSON.parse(p.data);
    }
    const score = computePriorityScore(phaseMap);

    db.update(features)
      .set({ status: 'completed', priorityScore: score, updatedAt: new Date().toISOString() })
      .where(eq(features.id, featureId))
      .run();
  }

  const phase = db
    .select()
    .from(phaseData)
    .where(and(eq(phaseData.featureId, featureId), eq(phaseData.phaseNumber, phaseNum)))
    .get();

  res.json(phase ? { ...phase, data: JSON.parse(phase.data) } : null);
});

export default router;
