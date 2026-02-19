import type { FeatureStatus, PhaseStatus } from '../../types';

const featureStatusColors: Record<FeatureStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  archived: 'bg-yellow-100 text-yellow-700',
};

const phaseStatusColors: Record<PhaseStatus, string> = {
  not_started: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  skipped: 'bg-orange-100 text-orange-700',
};

export function FeatureStatusBadge({ status }: { status: FeatureStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${featureStatusColors[status]}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

export function PhaseStatusBadge({ status }: { status: PhaseStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${phaseStatusColors[status]}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
