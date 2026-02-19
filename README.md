# AI Feature Prioritization App

A Jira-style project management tool for planning and prioritizing AI/ML features, built around a **9-phase strategic framework** from [The Strategic Approach to Building Machine Learning Models](https://www.linkedin.com/pulse/strategic-approach-building-machine-learning-models-guide-lwowski-mesmf) by Jonathan Lwowski.

## The 9-Phase Pipeline

Every AI feature flows through a structured evaluation pipeline before it reaches the roadmap:

| Phase | Name | Key Question |
|-------|------|-------------|
| 1 | Business Requirements | What business problem does this solve? |
| 2 | Risk vs Reward | Is the potential impact worth the risk? |
| 3 | ML Necessity Check | Do we actually need ML, or will a simpler solution work? |
| 4 | Data Availability | What labeled/unlabeled data exists, and what's the cost to get more? |
| 5 | Data Labeling Plan | How will we collect and label the data before committing to build? |
| 6 | Model Selection | Which model fits best? (Favor proven models over SOTA hype.) |
| 7 | Evaluation Strategy | How do we measure success with **business** metrics, not just accuracy? |
| 8 | Effort Estimation | How much effort will this take, and what's the likelihood of success? |
| 9 | Final Prioritization | Score, rank, and place the feature on the roadmap. |

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Seed the database with demo data
npm run seed

# 3. Start both backend and frontend in dev mode
npm run dev
```

The app will be available at:
- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3001

## Demo Credentials

The seed script creates three users:

| Email | Password | Role |
|-------|----------|------|
| `admin@example.com` | `admin123` | Admin |
| `pm@example.com` | `pm123` | Product Manager |
| `engineer@example.com` | `eng123` | Engineer |

It also creates a sample project ("Aerial Inspection AI") with four AI features at various pipeline stages.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start backend (port 3001) and frontend (port 5173) concurrently |
| `npm run build` | Build both backend and frontend for production |
| `npm run seed` | Seed the SQLite database with demo users, project, and features |

### Workspace-specific scripts

```bash
# Backend only
npm run dev -w backend      # Start backend with hot-reload
npm run build -w backend    # Compile TypeScript
npm run seed -w backend     # Seed database

# Frontend only
npm run dev -w frontend     # Start Vite dev server
npm run build -w frontend   # Type-check + production build
npm run preview -w frontend # Preview production build
```

## Tech Stack

### Frontend
- **React 18** + TypeScript
- **Vite** for dev server and bundling
- **Tailwind CSS** for styling
- **Zustand** for state management
- **React Router v6** for routing

### Backend
- **Express** + TypeScript
- **SQLite** via better-sqlite3 (zero external DB setup)
- **Drizzle ORM** for type-safe queries
- **bcryptjs** for password hashing
- **express-session** for auth

## Project Structure

```
Product-management-app/
├── package.json              # npm workspaces root
├── backend/
│   ├── src/
│   │   ├── index.ts          # Express server entry point
│   │   ├── db/
│   │   │   ├── index.ts      # Database connection + table creation
│   │   │   ├── schema.ts     # Drizzle ORM schema
│   │   │   └── seed.ts       # Demo data seeder
│   │   ├── routes/
│   │   │   ├── auth.ts       # Register, login, logout, /me
│   │   │   ├── projects.ts   # CRUD for projects
│   │   │   ├── features.ts   # CRUD for features (tickets) + scoring
│   │   │   ├── phases.ts     # Get/update phase data, phase completion
│   │   │   ├── comments.ts   # Per-feature, per-phase comments
│   │   │   └── tags.ts       # Tag management
│   │   ├── middleware/
│   │   │   └── auth.ts       # Session-based auth middleware
│   │   └── utils/
│   │       └── scoring.ts    # Priority score computation
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Root component with routing
│   │   ├── main.tsx           # Entry point
│   │   ├── stores/            # Zustand state stores
│   │   ├── pages/             # Route-level page components
│   │   ├── components/
│   │   │   ├── layout/        # Sidebar, Header, Layout shell
│   │   │   ├── board/         # Kanban board, columns, feature cards
│   │   │   ├── phases/        # 9 phase-specific form components
│   │   │   └── common/        # StatusBadge, ScoreSlider, CommentThread
│   │   ├── types/             # Shared TypeScript types
│   │   └── utils/             # API client, scoring utility
│   ├── index.html
│   ├── tailwind.config.js
│   └── vite.config.ts
└── .gitignore
```

## App Features

### Pipeline Board
A Kanban-style board with 9 columns, one per phase. Feature cards show title, assignee, status, and priority score. Click a card to open its detail view.

### Feature Detail View
Each feature has a tabbed interface across all 9 phases. Each phase tab contains:
- A structured form with fields specific to that phase
- Status indicators (not started / in progress / completed)
- "Save Phase Data" to persist your work
- "Complete & Next Phase" to advance the feature through the pipeline

### Phase-Specific Forms
- **Phase 1:** Problem statement, target users, success criteria, business metrics (tag input), stakeholders, deadline pressure
- **Phase 2:** Reward/risk scoring (1-10 sliders), risk table with severity + mitigation, go/no-go decision
- **Phase 3:** Alternatives comparison table, ML necessity toggle, simpler baseline
- **Phase 4:** Labeled/unlabeled data inventory, data gaps, cost estimates, data readiness score
- **Phase 5:** Labeling approach, volume estimates, time/cost, QA plan
- **Phase 6:** Model candidates table, SOTA warning banner, baseline model, infrastructure needs
- **Phase 7:** Academic metrics + business metrics mapping, A/B test plan, minimum viable performance
- **Phase 8:** Dev weeks, team size, required skills, success likelihood slider, key uncertainties
- **Phase 9:** Auto-computed priority score, roadmap quarter/tier, final decision (approve/defer/reject)

### Priority Scoring
Features are automatically scored using data from phases 1, 2, 4, and 8:

```
Score = (Business Impact x Risk-Reward Ratio x Data Readiness) / (Normalized Effort x (1 - Success Likelihood / 10))
```

### Dashboard
- Features grouped by current phase
- Effort vs Impact priority matrix (quadrant chart)
- Recent activity feed

### Roadmap View
Features organized into swimlanes: **Now**, **Next**, **Later**, and **Icebox** based on the roadmap tier set in Phase 9.

## API Reference

All API routes are prefixed with `/api`. Authentication is required for all routes except login and register.

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/auth/me` | Current user |
| GET | `/api/auth/users` | List all users |
| GET | `/api/projects` | List projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/:id` | Get project |
| PUT | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project |
| GET | `/api/features/project/:projectId` | List features for a project |
| GET | `/api/features/:id` | Get feature with all phase data |
| POST | `/api/features` | Create feature |
| PUT | `/api/features/:id` | Update feature |
| DELETE | `/api/features/:id` | Delete feature |
| POST | `/api/features/:id/score` | Recalculate priority score |
| GET | `/api/phases/feature/:featureId` | Get all phases for a feature |
| PUT | `/api/phases/feature/:featureId/:phaseNumber` | Update phase data/status |
| GET | `/api/comments/feature/:featureId` | Get comments for a feature |
| POST | `/api/comments` | Add a comment |
| GET | `/api/tags/project/:projectId` | List tags for a project |
| POST | `/api/tags` | Create a tag |
