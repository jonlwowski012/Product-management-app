import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'pm', 'engineer', 'viewer'] }).notNull().default('pm'),
  createdAt: text('created_at').notNull(),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  ownerId: text('owner_id').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const features = sqliteTable('features', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status', { enum: ['draft', 'in_progress', 'completed', 'archived'] }).notNull().default('draft'),
  featureType: text('feature_type', { enum: ['model', 'pipeline', 'data', 'infrastructure', 'research', 'other'] }).notNull().default('model'),
  priority: text('priority', { enum: ['critical', 'high', 'medium', 'low'] }).notNull().default('medium'),
  currentPhase: integer('current_phase').notNull().default(1),
  priorityScore: real('priority_score'),
  storyPoints: integer('story_points'),
  dueDate: text('due_date'),
  assigneeId: text('assignee_id').references(() => users.id),
  reporterId: text('reporter_id').references(() => users.id),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const phaseData = sqliteTable('phase_data', {
  id: text('id').primaryKey(),
  featureId: text('feature_id').notNull().references(() => features.id, { onDelete: 'cascade' }),
  phaseNumber: integer('phase_number').notNull(),
  status: text('status', { enum: ['not_started', 'in_progress', 'completed', 'skipped'] }).notNull().default('not_started'),
  data: text('data').notNull().default('{}'),
  completedAt: text('completed_at'),
  completedBy: text('completed_by').references(() => users.id),
});

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  featureId: text('feature_id').notNull().references(() => features.id, { onDelete: 'cascade' }),
  phaseNumber: integer('phase_number'),
  userId: text('user_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull(),
});

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#3b82f6'),
});

export const featureTags = sqliteTable('feature_tags', {
  featureId: text('feature_id').notNull().references(() => features.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
});
