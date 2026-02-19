# AI Feature Prioritization & Planning App

## Overview

A Jira-style project management application specifically designed for AI/ML feature planning, built around the 9-step strategic framework from Jonathan Lwowski's "The Strategic Approach to Building Machine Learning Models" LinkedIn series. Each AI feature goes through a structured pipeline of 9 phases, with dedicated tooling at each stage to help product managers and ML teams make informed decisions.

## The 9-Phase Pipeline (from the blog series)

Each AI feature/ticket progresses through these phases:

1. **Business/Product Requirements** - Define the business problem and product requirements the ML model needs to solve
2. **Risk vs Reward Assessment** - Evaluate the potential impact against the risks of building the ML solution
3. **ML Necessity Check** - Determine if machine learning is actually needed or if simpler solutions suffice
4. **Data Availability Assessment** - Identify what labeled and unlabeled data is available and the cost to acquire more
5. **Data Labeling Plan** - Create a concrete plan for data collection and labeling before committing to build
6. **Model Selection** - Choose the appropriate model (favoring proven architectures over SOTA hype)
7. **Evaluation Strategy** - Define how the model will be evaluated using business metrics, not just academic metrics
8. **Effort & Success Estimation** - Estimate development effort and likelihood of success
9. **Final Prioritization & Roadmap Placement** - Score, rank, and place the feature on the roadmap

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **UI Library**: Tailwind CSS + shadcn/ui components
- **State Management**: Zustand (lightweight, simple)
- **Routing**: React Router v6
- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite via better-sqlite3 (simple, no external DB needed)
- **ORM**: Drizzle ORM (lightweight, type-safe)
- **Auth**: Simple session-based auth (bcrypt + express-session)
- **Testing**: Vitest (frontend) + Vitest (backend)

## Project Structure

```
Product-management-app/
├── package.json                  # Root workspace config
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── stores/              # Zustand stores
│   │   │   ├── authStore.ts
│   │   │   ├── projectStore.ts
│   │   │   └── featureStore.ts
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Header.tsx
│   │   │   │   └── Layout.tsx
│   │   │   ├── board/
│   │   │   │   ├── KanbanBoard.tsx
│   │   │   │   ├── PhaseColumn.tsx
│   │   │   │   └── FeatureCard.tsx
│   │   │   ├── features/
│   │   │   │   ├── FeatureDetail.tsx
│   │   │   │   ├── FeatureForm.tsx
│   │   │   │   └── PhasePanel.tsx
│   │   │   ├── phases/
│   │   │   │   ├── BusinessRequirements.tsx
│   │   │   │   ├── RiskReward.tsx
│   │   │   │   ├── MLNecessityCheck.tsx
│   │   │   │   ├── DataAvailability.tsx
│   │   │   │   ├── DataLabelingPlan.tsx
│   │   │   │   ├── ModelSelection.tsx
│   │   │   │   ├── EvaluationStrategy.tsx
│   │   │   │   ├── EffortEstimation.tsx
│   │   │   │   └── FinalPrioritization.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   ├── PriorityMatrix.tsx
│   │   │   │   └── RoadmapView.tsx
│   │   │   └── common/
│   │   │       ├── ScoreSlider.tsx
│   │   │       ├── StatusBadge.tsx
│   │   │       └── CommentThread.tsx
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── BoardPage.tsx
│   │   │   ├── FeaturePage.tsx
│   │   │   ├── RoadmapPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   ├── types/
│   │   │   └── index.ts
│   │   └── utils/
│   │       ├── api.ts
│   │       └── scoring.ts
│   └── public/
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts              # Express server entry
│   │   ├── db/
│   │   │   ├── schema.ts         # Drizzle schema
│   │   │   └── migrate.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── projects.ts
│   │   │   ├── features.ts
│   │   │   └── phases.ts
│   │   ├── middleware/
│   │   │   └── auth.ts
│   │   └── utils/
│   │       └── scoring.ts        # Prioritization scoring logic
│   └── drizzle/
│       └── migrations/
└── README.md
```

## Data Model

### Core Tables

**users**
- id, email, name, password_hash, role (admin | pm | engineer | viewer), created_at

**projects**
- id, name, description, owner_id, created_at, updated_at

**features** (the main "ticket" entity)
- id, project_id, title, description, status (draft | in_progress | completed | archived)
- current_phase (1-9), priority_score (computed), assignee_id
- created_by, created_at, updated_at

**phase_data** (stores structured data for each phase of each feature)
- id, feature_id, phase_number (1-9), status (not_started | in_progress | completed | skipped)
- data (JSON blob - phase-specific structured data), completed_at, completed_by

**comments**
- id, feature_id, phase_number (nullable), user_id, content, created_at

**tags**
- id, project_id, name, color

**feature_tags**
- feature_id, tag_id

## Phase-Specific Data Structures

### Phase 1: Business/Product Requirements
```json
{
  "problem_statement": "string",
  "target_users": "string",
  "success_criteria": "string",
  "business_metrics_impacted": ["metric1", "metric2"],
  "current_solution": "string",
  "stakeholders": ["name1", "name2"],
  "deadline_pressure": "low | medium | high"
}
```

### Phase 2: Risk vs Reward Assessment
```json
{
  "potential_reward": "string",
  "reward_score": 1-10,
  "risks": [{"description": "string", "severity": "low|medium|high", "mitigation": "string"}],
  "risk_score": 1-10,
  "risk_reward_ratio": "computed",
  "go_no_go": "go | no_go | needs_more_info"
}
```

### Phase 3: ML Necessity Check
```json
{
  "alternatives_considered": [{"approach": "string", "pros": "string", "cons": "string"}],
  "why_ml_needed": "string",
  "ml_is_necessary": true/false,
  "complexity_justification": "string",
  "simpler_baseline": "string"
}
```

### Phase 4: Data Availability Assessment
```json
{
  "labeled_data_available": {"exists": true/false, "volume": "string", "quality": "low|medium|high"},
  "unlabeled_data_available": {"exists": true/false, "volume": "string", "sources": ["source1"]},
  "data_gaps": ["gap1", "gap2"],
  "acquisition_cost_estimate": "string",
  "data_privacy_concerns": "string",
  "data_readiness_score": 1-10
}
```

### Phase 5: Data Labeling Plan
```json
{
  "labeling_approach": "in_house | outsourced | crowdsourced | automated | hybrid",
  "estimated_labels_needed": "number",
  "labeling_guidelines_ready": true/false,
  "estimated_time_weeks": "number",
  "estimated_cost": "string",
  "quality_assurance_plan": "string",
  "labeling_tool": "string"
}
```

### Phase 6: Model Selection
```json
{
  "model_candidates": [{"name": "string", "type": "string", "rationale": "string", "complexity": "low|medium|high"}],
  "selected_model": "string",
  "is_sota": true/false,
  "sota_justification": "string (required if is_sota is true)",
  "baseline_model": "string",
  "infrastructure_requirements": "string"
}
```

### Phase 7: Evaluation Strategy
```json
{
  "academic_metrics": [{"name": "string", "target": "string"}],
  "business_metrics": [{"name": "string", "current_value": "string", "target_value": "string", "measurement_method": "string"}],
  "evaluation_dataset": "string",
  "ab_test_plan": "string",
  "minimum_viable_performance": "string"
}
```

### Phase 8: Effort & Success Estimation
```json
{
  "estimated_dev_weeks": "number",
  "team_size_needed": "number",
  "required_skills": ["skill1", "skill2"],
  "infrastructure_cost": "string",
  "likelihood_of_success": 1-10,
  "confidence_level": "low | medium | high",
  "key_uncertainties": ["uncertainty1"],
  "blocking_dependencies": ["dep1"]
}
```

### Phase 9: Final Prioritization & Roadmap Placement
```json
{
  "priority_score": "computed from phases 1-8",
  "roadmap_quarter": "Q1 2025 | Q2 2025 | ...",
  "roadmap_tier": "now | next | later | icebox",
  "final_decision": "approved | deferred | rejected",
  "decision_rationale": "string",
  "reviewer": "string"
}
```

## Scoring & Prioritization Algorithm

The final priority score is computed from the phase data:

```
Priority Score = (Business Impact * Risk-Reward Ratio * Data Readiness) / (Effort * (1 - Success Likelihood/10))
```

Where:
- **Business Impact** (from Phase 1): deadline_pressure mapped to 1-3, combined with number of business_metrics_impacted
- **Risk-Reward Ratio** (from Phase 2): reward_score / risk_score
- **Data Readiness** (from Phase 4): data_readiness_score / 10
- **Effort** (from Phase 8): estimated_dev_weeks * team_size_needed (normalized)
- **Success Likelihood** (from Phase 8): likelihood_of_success

Features can be sorted/filtered by this score on the dashboard.

## Implementation Plan (Ordered Steps)

### Step 1: Project Scaffolding
- Initialize npm workspaces (root package.json)
- Set up frontend with Vite + React + TypeScript
- Set up backend with Express + TypeScript
- Configure Tailwind CSS
- Add shared TypeScript types

### Step 2: Database & Backend Foundation
- Define Drizzle ORM schema for all tables
- Set up SQLite database with migrations
- Implement basic Express server with CORS, JSON parsing
- Implement auth routes (register, login, logout)
- Implement session middleware

### Step 3: API Routes
- CRUD routes for projects
- CRUD routes for features (tickets)
- Phase data routes (get/update phase data for a feature)
- Comments routes
- Tags routes
- Scoring/prioritization endpoint

### Step 4: Frontend Layout & Routing
- App shell with sidebar navigation and header
- React Router setup with all page routes
- Auth pages (login/register)
- Zustand stores for auth, projects, features
- API utility layer (fetch wrapper)

### Step 5: Kanban Board View
- 9-column Kanban board (one column per phase)
- Drag-and-drop feature cards between phases
- Feature cards showing title, assignee, priority score, status
- Quick-add feature button
- Filter/search bar

### Step 6: Feature Detail View & Phase Panels
- Feature detail page with tabbed/accordion phase panels
- Each phase has its own dedicated form component with the structured fields
- Phase completion workflow (mark phase complete to advance)
- Comment thread per feature and per phase
- Activity log

### Step 7: Phase-Specific Components
- Phase 1: Business requirements form with multi-select for metrics
- Phase 2: Risk assessment table with severity ratings + go/no-go decision
- Phase 3: Alternatives comparison table + ML necessity toggle
- Phase 4: Data inventory form with quality scoring
- Phase 5: Labeling plan form with time/cost estimates
- Phase 6: Model candidate comparison table with SOTA warning
- Phase 7: Metrics mapping table (academic -> business)
- Phase 8: Effort estimation form with confidence slider
- Phase 9: Auto-computed score + roadmap placement selector

### Step 8: Dashboard & Roadmap
- Dashboard with summary metrics (features by phase, avg scores, etc.)
- Priority matrix visualization (impact vs effort scatter plot)
- Roadmap view (timeline with features grouped by quarter/tier)
- Phase funnel chart (how many features at each phase)

### Step 9: Polish & Testing
- Responsive design for tablet/desktop
- Loading states and error handling
- Form validation on all phase panels
- Unit tests for scoring logic
- Integration tests for API routes
- Seed data script for demo purposes
