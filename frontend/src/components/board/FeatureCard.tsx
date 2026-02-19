import { useNavigate } from 'react-router-dom';
import type { Feature, FeatureStatus } from '../../types';
import { FeatureStatusBadge } from '../common/StatusBadge';

const statusBorderColors: Record<FeatureStatus, string> = {
  draft: 'border-l-gray-400',
  in_progress: 'border-l-blue-500',
  completed: 'border-l-green-500',
  archived: 'border-l-yellow-500',
};

interface FeatureCardProps {
  feature: Feature;
}

export default function FeatureCard({ feature }: FeatureCardProps) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/features/${feature.id}`)}
      className={`bg-white rounded-lg shadow-sm border border-gray-200 border-l-4 ${statusBorderColors[feature.status]} p-3 cursor-pointer hover:shadow-md transition-shadow`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium text-gray-900 leading-snug line-clamp-2">
          {feature.title}
        </h4>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <FeatureStatusBadge status={feature.status} />
        {feature.priorityScore !== null && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700">
            {feature.priorityScore}
          </span>
        )}
      </div>

      {feature.tags && feature.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {feature.tags.slice(0, 3).map((tag) => (
            <span
              key={tag.id}
              className="inline-block px-1.5 py-0.5 rounded text-xs"
              style={{ backgroundColor: tag.color + '20', color: tag.color }}
            >
              {tag.name}
            </span>
          ))}
          {feature.tags.length > 3 && (
            <span className="text-xs text-gray-400">+{feature.tags.length - 3}</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500">
        {feature.assigneeName ? (
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[10px] font-medium">
              {feature.assigneeName.charAt(0).toUpperCase()}
            </div>
            <span className="truncate max-w-[80px]">{feature.assigneeName}</span>
          </div>
        ) : (
          <span className="text-gray-400 italic">Unassigned</span>
        )}
        <span>Phase {feature.currentPhase}/9</span>
      </div>
    </div>
  );
}
