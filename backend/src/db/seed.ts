import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from './index.js';
import { users, projects, features, phaseData } from './schema.js';

async function seed() {
  console.log('Seeding database...');

  // Create users
  const adminId = uuid();
  const pmId = uuid();
  const engineerId = uuid();
  const now = new Date().toISOString();

  const adminHash = await bcrypt.hash('admin123', 10);
  const pmHash = await bcrypt.hash('pm123', 10);
  const engHash = await bcrypt.hash('eng123', 10);

  db.insert(users).values([
    { id: adminId, email: 'admin@example.com', name: 'Alice Admin', passwordHash: adminHash, role: 'admin', createdAt: now },
    { id: pmId, email: 'pm@example.com', name: 'Bob PM', passwordHash: pmHash, role: 'pm', createdAt: now },
    { id: engineerId, email: 'engineer@example.com', name: 'Carol Engineer', passwordHash: engHash, role: 'engineer', createdAt: now },
  ]).run();

  // Create project
  const projectId = uuid();
  db.insert(projects).values({
    id: projectId,
    name: 'Aerial Inspection AI',
    description: 'ML-powered aerial inspection system for solar panels and infrastructure',
    ownerId: pmId,
    createdAt: now,
    updatedAt: now,
  }).run();

  // Create sample features
  const sampleFeatures = [
    {
      title: 'Solar Panel Defect Detection',
      description: 'Use computer vision to automatically detect cracks, hotspots, and soiling on solar panels from drone imagery',
      currentPhase: 5,
      status: 'in_progress' as const,
    },
    {
      title: 'Vegetation Encroachment Classifier',
      description: 'Classify areas where vegetation is encroaching on power lines or infrastructure from satellite/drone images',
      currentPhase: 3,
      status: 'in_progress' as const,
    },
    {
      title: 'Automated Report Generation',
      description: 'Use LLMs to auto-generate inspection reports from structured inspection findings',
      currentPhase: 1,
      status: 'draft' as const,
    },
    {
      title: 'Thermal Anomaly Detection',
      description: 'Detect thermal anomalies in electrical infrastructure using IR imagery and ML',
      currentPhase: 7,
      status: 'in_progress' as const,
    },
  ];

  for (const feat of sampleFeatures) {
    const featureId = uuid();
    db.insert(features).values({
      id: featureId,
      projectId,
      title: feat.title,
      description: feat.description,
      status: feat.status,
      currentPhase: feat.currentPhase,
      assigneeId: engineerId,
      createdBy: pmId,
      createdAt: now,
      updatedAt: now,
    }).run();

    for (let i = 1; i <= 9; i++) {
      let phaseStatus: 'not_started' | 'in_progress' | 'completed' = 'not_started';
      let data = '{}';

      if (i < feat.currentPhase) {
        phaseStatus = 'completed';
      } else if (i === feat.currentPhase) {
        phaseStatus = 'in_progress';
      }

      // Add sample data for completed phases
      if (i === 1 && feat.currentPhase > 1) {
        data = JSON.stringify({
          problem_statement: `Automatically identify issues in ${feat.title.toLowerCase()} to reduce manual inspection time`,
          target_users: 'Field inspection teams, asset managers',
          success_criteria: 'Reduce inspection time by 50% while maintaining 95% detection accuracy',
          business_metrics_impacted: ['inspection_time', 'detection_accuracy', 'cost_per_inspection'],
          current_solution: 'Manual visual inspection by trained technicians',
          stakeholders: ['VP Engineering', 'Head of Operations', 'ML Team Lead'],
          deadline_pressure: 'medium',
        });
      }

      if (i === 2 && feat.currentPhase > 2) {
        data = JSON.stringify({
          potential_reward: 'Major cost savings and faster turnaround for customers',
          reward_score: 8,
          risks: [
            { description: 'Model accuracy may not meet safety-critical thresholds', severity: 'high', mitigation: 'Implement human-in-the-loop review for edge cases' },
            { description: 'Training data may have geographic bias', severity: 'medium', mitigation: 'Collect diverse datasets across regions' },
          ],
          risk_score: 5,
          go_no_go: 'go',
        });
      }

      db.insert(phaseData).values({
        id: uuid(),
        featureId,
        phaseNumber: i,
        status: phaseStatus,
        data,
        completedAt: phaseStatus === 'completed' ? now : null,
        completedBy: phaseStatus === 'completed' ? pmId : null,
      }).run();
    }
  }

  console.log('Seed complete!');
  console.log('Login credentials:');
  console.log('  admin@example.com / admin123');
  console.log('  pm@example.com / pm123');
  console.log('  engineer@example.com / eng123');
}

seed().catch(console.error);
