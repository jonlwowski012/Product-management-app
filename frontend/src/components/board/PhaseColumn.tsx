import type { Feature } from '../../types';
import FeatureCard from './FeatureCard';

interface PhaseColumnProps {
  phaseNumber: number;
  phaseName: string;
  features: Feature[];
}

export default function PhaseColumn({ phaseNumber, phaseName, features }: PhaseColumnProps) {
  return (
    <div className="flex-shrink-0 w-72 flex flex-col bg-gray-100 rounded-lg">
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-300 text-gray-700 text-xs font-bold">
              {phaseNumber}
            </span>
            <h3 className="text-sm font-semibold text-gray-800 truncate" title={phaseName}>
              {phaseName}
            </h3>
          </div>
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-200 text-gray-600 text-xs font-medium">
            {features.length}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px]">
        {features.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">No features in this phase</p>
        ) : (
          features.map((feature) => (
            <FeatureCard key={feature.id} feature={feature} />
          ))
        )}
      </div>
    </div>
  );
}
