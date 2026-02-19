import { useEffect, useState, useMemo } from 'react';
import Header from '../components/layout/Header';
import { useProjectStore } from '../stores/projectStore';
import { useFeatureStore } from '../stores/featureStore';
import { FeatureStatusBadge } from '../components/common/StatusBadge';
import { api } from '../utils/api';
import type { Feature, PhaseData, Phase9Data } from '../types';

type RoadmapTier = 'now' | 'next' | 'later' | 'icebox';

interface TierConfig {
  key: RoadmapTier | 'unplanned';
  label: string;
  color: string;
  borderColor: string;
  bgColor: string;
}

const TIERS: TierConfig[] = [
  { key: 'now', label: 'Now', color: 'text-green-700', borderColor: 'border-green-400', bgColor: 'bg-green-50' },
  { key: 'next', label: 'Next', color: 'text-blue-700', borderColor: 'border-blue-400', bgColor: 'bg-blue-50' },
  { key: 'later', label: 'Later', color: 'text-yellow-700', borderColor: 'border-yellow-400', bgColor: 'bg-yellow-50' },
  { key: 'icebox', label: 'Icebox', color: 'text-gray-700', borderColor: 'border-gray-400', bgColor: 'bg-gray-50' },
  { key: 'unplanned', label: 'Unplanned', color: 'text-gray-500', borderColor: 'border-gray-300', bgColor: 'bg-white' },
];

interface FeatureWithTier {
  feature: Feature;
  tier: RoadmapTier | 'unplanned';
  phase9Data: Phase9Data | null;
}

export default function RoadmapPage() {
  const { currentProject } = useProjectStore();
  const { features, fetchFeatures, loading } = useFeatureStore();
  const [tierMap, setTierMap] = useState<Record<string, RoadmapTier | 'unplanned'>>({});
  const [phase9Map, setPhase9Map] = useState<Record<string, Phase9Data | null>>({});
  const [loadingTiers, setLoadingTiers] = useState(false);

  useEffect(() => {
    if (currentProject) {
      fetchFeatures(currentProject.id);
    }
  }, [currentProject, fetchFeatures]);

  useEffect(() => {
    if (features.length === 0) {
      setTierMap({});
      setPhase9Map({});
      return;
    }

    let cancelled = false;

    const fetchTiers = async () => {
      setLoadingTiers(true);
      const newTierMap: Record<string, RoadmapTier | 'unplanned'> = {};
      const newPhase9Map: Record<string, Phase9Data | null> = {};

      await Promise.all(
        features.map(async (feature) => {
          try {
            const phaseData = await api.get<PhaseData>(`/phases/feature/${feature.id}/9`);
            if (cancelled) return;
            const data = phaseData.data as unknown as Phase9Data;
            if (data && data.roadmap_tier) {
              newTierMap[feature.id] = data.roadmap_tier;
              newPhase9Map[feature.id] = data;
            } else {
              newTierMap[feature.id] = 'unplanned';
              newPhase9Map[feature.id] = data || null;
            }
          } catch {
            if (cancelled) return;
            newTierMap[feature.id] = 'unplanned';
            newPhase9Map[feature.id] = null;
          }
        })
      );

      if (!cancelled) {
        setTierMap(newTierMap);
        setPhase9Map(newPhase9Map);
        setLoadingTiers(false);
      }
    };

    fetchTiers();

    return () => {
      cancelled = true;
    };
  }, [features]);

  const featuresByTier = useMemo(() => {
    const grouped: Record<string, FeatureWithTier[]> = {
      now: [],
      next: [],
      later: [],
      icebox: [],
      unplanned: [],
    };

    features.forEach((feature) => {
      const tier = tierMap[feature.id] || 'unplanned';
      grouped[tier].push({
        feature,
        tier,
        phase9Data: phase9Map[feature.id] || null,
      });
    });

    // Sort each tier by priority score descending
    Object.keys(grouped).forEach((tier) => {
      grouped[tier].sort(
        (a, b) => (b.feature.priorityScore ?? -1) - (a.feature.priorityScore ?? -1)
      );
    });

    return grouped;
  }, [features, tierMap, phase9Map]);

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Select a project to view the roadmap.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Roadmap" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {(loading || loadingTiers) && (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
          </div>
        )}

        {TIERS.map((tierConfig) => {
          const tierFeatures = featuresByTier[tierConfig.key] || [];

          return (
            <div key={tierConfig.key} className="card overflow-hidden">
              {/* Swimlane header */}
              <div
                className={`flex items-center justify-between px-5 py-3 border-b-2 ${tierConfig.borderColor} ${tierConfig.bgColor}`}
              >
                <div className="flex items-center gap-3">
                  <h3 className={`text-base font-semibold ${tierConfig.color}`}>
                    {tierConfig.label}
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white text-gray-600 shadow-sm">
                    {tierFeatures.length}
                  </span>
                </div>
              </div>

              {/* Feature cards */}
              <div className="p-4">
                {tierFeatures.length === 0 ? (
                  <p className="text-sm text-gray-400 italic py-2">No features in this tier.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {tierFeatures.map(({ feature }) => (
                      <RoadmapFeatureCard key={feature.id} feature={feature} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoadmapFeatureCard({ feature }: { feature: Feature }) {
  return (
    <div className="card p-4 hover:shadow-md transition-shadow cursor-pointer border border-gray-200">
      <h4 className="text-sm font-medium text-gray-900 mb-2 line-clamp-2">{feature.title}</h4>
      <div className="flex items-center gap-2 mb-2">
        <FeatureStatusBadge status={feature.status} />
        <span className="text-xs text-gray-500">Phase {feature.currentPhase}/9</span>
      </div>
      <div className="flex items-center justify-between">
        {feature.priorityScore !== null ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700">
            Score: {feature.priorityScore}
          </span>
        ) : (
          <span className="text-xs text-gray-400 italic">No score</span>
        )}
        {feature.assigneeName ? (
          <div className="flex items-center gap-1">
            <div className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[10px] font-medium">
              {feature.assigneeName.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs text-gray-600 truncate max-w-[80px]">
              {feature.assigneeName}
            </span>
          </div>
        ) : (
          <span className="text-xs text-gray-400 italic">Unassigned</span>
        )}
      </div>
    </div>
  );
}
