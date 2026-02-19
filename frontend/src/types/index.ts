export type UserRole = 'admin' | 'pm' | 'engineer' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export type FeatureStatus = 'draft' | 'in_progress' | 'completed' | 'archived';
export type PhaseStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';
export type FeatureType = 'model' | 'pipeline' | 'data' | 'infrastructure' | 'research' | 'other';
export type Priority = 'critical' | 'high' | 'medium' | 'low';

export const FEATURE_TYPES: { value: FeatureType; label: string }[] = [
  { value: 'model', label: 'Model' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'data', label: 'Data' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'research', label: 'Research' },
  { value: 'other', label: 'Other' },
];

export const PRIORITIES: { value: Priority; label: string; color: string }[] = [
  { value: 'critical', label: 'Critical', color: 'text-red-700 bg-red-100' },
  { value: 'high', label: 'High', color: 'text-orange-700 bg-orange-100' },
  { value: 'medium', label: 'Medium', color: 'text-yellow-700 bg-yellow-100' },
  { value: 'low', label: 'Low', color: 'text-blue-700 bg-blue-100' },
];

export const STATUSES: { value: FeatureStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

export const PHASE_NAMES: Record<number, string> = {
  1: 'Business Requirements',
  2: 'Risk vs Reward',
  3: 'ML Necessity Check',
  4: 'Data Availability',
  5: 'Data Labeling Plan',
  6: 'Model Selection',
  7: 'Evaluation Strategy',
  8: 'Effort Estimation',
  9: 'Final Prioritization',
};

export interface Project {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Feature {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: FeatureStatus;
  featureType: FeatureType;
  priority: Priority;
  currentPhase: number;
  priorityScore: number | null;
  storyPoints: number | null;
  dueDate: string | null;
  assigneeId: string | null;
  assigneeName?: string | null;
  reporterId: string | null;
  reporterName?: string | null;
  createdBy: string;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
  tags?: Tag[];
  phases?: PhaseData[];
}

export interface PhaseData {
  id: string;
  featureId: string;
  phaseNumber: number;
  status: PhaseStatus;
  data: Record<string, unknown>;
  completedAt: string | null;
  completedBy: string | null;
}

export interface Comment {
  id: string;
  featureId: string;
  phaseNumber: number | null;
  userId: string;
  userName?: string;
  content: string;
  createdAt: string;
}

export interface Tag {
  id: string;
  projectId: string;
  name: string;
  color: string;
}

// Phase-specific data types

export interface Phase1Data {
  problem_statement: string;
  target_users: string;
  success_criteria: string;
  business_metrics_impacted: string[];
  current_solution: string;
  stakeholders: string[];
  deadline_pressure: 'low' | 'medium' | 'high';
}

export interface RiskItem {
  description: string;
  severity: 'low' | 'medium' | 'high';
  mitigation: string;
}

export interface Phase2Data {
  potential_reward: string;
  reward_score: number;
  risks: RiskItem[];
  risk_score: number;
  go_no_go: 'go' | 'no_go' | 'needs_more_info';
}

export interface Alternative {
  approach: string;
  pros: string;
  cons: string;
}

export interface Phase3Data {
  alternatives_considered: Alternative[];
  why_ml_needed: string;
  ml_is_necessary: boolean;
  complexity_justification: string;
  simpler_baseline: string;
}

export interface Phase4Data {
  labeled_data_available: {
    exists: boolean;
    volume: string;
    quality: 'low' | 'medium' | 'high';
  };
  unlabeled_data_available: {
    exists: boolean;
    volume: string;
    sources: string[];
  };
  data_gaps: string[];
  acquisition_cost_estimate: string;
  data_privacy_concerns: string;
  data_readiness_score: number;
}

export interface Phase5Data {
  labeling_approach: 'in_house' | 'outsourced' | 'crowdsourced' | 'automated' | 'hybrid';
  estimated_labels_needed: number;
  labeling_guidelines_ready: boolean;
  estimated_time_weeks: number;
  estimated_cost: string;
  quality_assurance_plan: string;
  labeling_tool: string;
}

export interface ModelCandidate {
  name: string;
  type: string;
  rationale: string;
  complexity: 'low' | 'medium' | 'high';
}

export interface Phase6Data {
  model_candidates: ModelCandidate[];
  selected_model: string;
  is_sota: boolean;
  sota_justification: string;
  baseline_model: string;
  infrastructure_requirements: string;
}

export interface AcademicMetric {
  name: string;
  target: string;
}

export interface BusinessMetric {
  name: string;
  current_value: string;
  target_value: string;
  measurement_method: string;
}

export interface Phase7Data {
  academic_metrics: AcademicMetric[];
  business_metrics: BusinessMetric[];
  evaluation_dataset: string;
  ab_test_plan: string;
  minimum_viable_performance: string;
}

export interface Phase8Data {
  estimated_dev_weeks: number;
  team_size_needed: number;
  required_skills: string[];
  infrastructure_cost: string;
  likelihood_of_success: number;
  confidence_level: 'low' | 'medium' | 'high';
  key_uncertainties: string[];
  blocking_dependencies: string[];
}

export interface Phase9Data {
  priority_score: number;
  roadmap_quarter: string;
  roadmap_tier: 'now' | 'next' | 'later' | 'icebox';
  final_decision: 'approved' | 'deferred' | 'rejected';
  decision_rationale: string;
  reviewer: string;
}
