import { useEffect, useMemo } from 'react';
import Header from '../components/layout/Header';
import { useProjectStore } from '../stores/projectStore';
import { useFeatureStore } from '../stores/featureStore';
import { PHASE_NAMES } from '../types';
import type { Feature } from '../types';

const PHASE_BAR_COLORS: Record<number, string> = {
  1: 'bg-blue-500',
  2: 'bg-orange-500',
  3: 'bg-yellow-500',
  4: 'bg-green-500',
  5: 'bg-teal-500',
  6: 'bg-cyan-500',
  7: 'bg-indigo-500',
  8: 'bg-purple-500',
  9: 'bg-pink-500',
};

function getEffortBucket(feature: Feature): number {
  const phase8 = feature.phases?.find((p) => p.phaseNumber === 8);
  if (!phase8 || !phase8.data) return -1;
  const weeks = (phase8.data as Record<string, unknown>).estimated_dev_weeks;
  if (typeof weeks !== 'number') return -1;
  if (weeks <= 2) return 0;
  if (weeks <= 6) return 1;
  if (weeks <= 12) return 2;
  return 3;
}

function getImpactBucket(feature: Feature): number {
  const phase2 = feature.phases?.find((p) => p.phaseNumber === 2);
  if (!phase2 || !phase2.data) return -1;
  const score = (phase2.data as Record<string, unknown>).reward_score;
  if (typeof score !== 'number') return -1;
  if (score <= 3) return 0;
  if (score <= 5) return 1;
  if (score <= 7) return 2;
  return 3;
}

export default function DashboardPage() {
  const { currentProject } = useProjectStore();
  const { features, fetchFeatures, loading } = useFeatureStore();

  useEffect(() => {
    if (currentProject) {
      fetchFeatures(currentProject.id);
    }
  }, [currentProject, fetchFeatures]);

  const stats = useMemo(() => {
    const total = features.length;
    const inProgress = features.filter((f) => f.status === 'in_progress').length;
    const completed = features.filter((f) => f.status === 'completed').length;
    const scored = features.filter((f) => f.priorityScore !== null);
    const avgScore =
      scored.length > 0
        ? Math.round(
            (scored.reduce((sum, f) => sum + (f.priorityScore ?? 0), 0) / scored.length) * 10
          ) / 10
        : 0;
    return { total, inProgress, completed, avgScore };
  }, [features]);

  const phaseCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (let i = 1; i <= 9; i++) counts[i] = 0;
    features.forEach((f) => {
      if (f.currentPhase >= 1 && f.currentPhase <= 9) {
        counts[f.currentPhase]++;
      }
    });
    return counts;
  }, [features]);

  const maxPhaseCount = useMemo(() => Math.max(...Object.values(phaseCounts), 1), [phaseCounts]);

  const recentFeatures = useMemo(() => {
    return [...features]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 8);
  }, [features]);

  const matrixFeatures = useMemo(() => {
    return features
      .map((f) => ({
        feature: f,
        effort: getEffortBucket(f),
        impact: getImpactBucket(f),
      }))
      .filter((item) => item.effort >= 0 && item.impact >= 0);
  }, [features]);

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Select a project to view the dashboard.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Dashboard" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {loading && (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-5">
            <p className="text-sm font-medium text-gray-500">Total Features</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="card p-5">
            <p className="text-sm font-medium text-gray-500">In Progress</p>
            <p className="mt-1 text-3xl font-bold text-blue-600">{stats.inProgress}</p>
          </div>
          <div className="card p-5">
            <p className="text-sm font-medium text-gray-500">Completed</p>
            <p className="mt-1 text-3xl font-bold text-green-600">{stats.completed}</p>
          </div>
          <div className="card p-5">
            <p className="text-sm font-medium text-gray-500">Avg Priority Score</p>
            <p className="mt-1 text-3xl font-bold text-purple-600">{stats.avgScore}</p>
          </div>
        </div>

        {/* Features by Phase Bar Chart */}
        <div className="card p-5">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Features by Phase</h3>
          <div className="space-y-3">
            {Array.from({ length: 9 }, (_, i) => i + 1).map((phase) => (
              <div key={phase} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-36 truncate" title={PHASE_NAMES[phase]}>
                  {phase}. {PHASE_NAMES[phase]}
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                  <div
                    className={`${PHASE_BAR_COLORS[phase]} h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2`}
                    style={{
                      width: `${Math.max((phaseCounts[phase] / maxPhaseCount) * 100, phaseCounts[phase] > 0 ? 8 : 0)}%`,
                    }}
                  >
                    {phaseCounts[phase] > 0 && (
                      <span className="text-xs font-semibold text-white">{phaseCounts[phase]}</span>
                    )}
                  </div>
                </div>
                {phaseCounts[phase] === 0 && (
                  <span className="text-xs text-gray-400 w-4">0</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Priority Matrix */}
        <div className="card p-5">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Priority Matrix</h3>
          <p className="text-xs text-gray-500 mb-3">
            Features positioned by Effort (x-axis) vs Impact (y-axis). Based on Phase 2 reward score and Phase 8 effort estimate.
          </p>
          <div className="relative">
            {/* Y-axis label */}
            <div className="absolute -left-2 top-1/2 -translate-y-1/2 -rotate-90 text-xs font-medium text-gray-500 whitespace-nowrap">
              Impact
            </div>

            <div className="ml-6">
              {/* Grid */}
              <div className="grid grid-cols-4 grid-rows-4 border border-gray-200 rounded-lg overflow-hidden">
                {/* Render from top (high impact) to bottom (low impact) */}
                {[3, 2, 1, 0].map((impactRow) =>
                  [0, 1, 2, 3].map((effortCol) => {
                    const cellFeatures = matrixFeatures.filter(
                      (item) => item.effort === effortCol && item.impact === impactRow
                    );
                    const isQuickWin = effortCol <= 1 && impactRow >= 2;
                    const isBigBet = effortCol >= 2 && impactRow >= 2;
                    const isFillIn = effortCol <= 1 && impactRow <= 1;
                    const isAvoid = effortCol >= 2 && impactRow <= 1;

                    let bgColor = 'bg-gray-50';
                    if (isQuickWin) bgColor = 'bg-green-50';
                    else if (isBigBet) bgColor = 'bg-yellow-50';
                    else if (isFillIn) bgColor = 'bg-blue-50';
                    else if (isAvoid) bgColor = 'bg-red-50';

                    return (
                      <div
                        key={`${impactRow}-${effortCol}`}
                        className={`${bgColor} border border-gray-100 p-2 min-h-[80px] relative`}
                      >
                        {/* Quadrant label (only in corners) */}
                        {impactRow === 3 && effortCol === 0 && (
                          <span className="absolute top-1 left-1 text-[10px] font-medium text-green-600">
                            Quick Wins
                          </span>
                        )}
                        {impactRow === 3 && effortCol === 3 && (
                          <span className="absolute top-1 right-1 text-[10px] font-medium text-yellow-600">
                            Big Bets
                          </span>
                        )}
                        {impactRow === 0 && effortCol === 0 && (
                          <span className="absolute bottom-1 left-1 text-[10px] font-medium text-blue-600">
                            Fill-Ins
                          </span>
                        )}
                        {impactRow === 0 && effortCol === 3 && (
                          <span className="absolute bottom-1 right-1 text-[10px] font-medium text-red-600">
                            Avoid
                          </span>
                        )}

                        {/* Feature dots */}
                        <div className="flex flex-wrap gap-1 mt-3">
                          {cellFeatures.map(({ feature }) => (
                            <div
                              key={feature.id}
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white cursor-pointer hover:scale-125 transition-transform"
                              style={{
                                backgroundColor:
                                  feature.status === 'completed'
                                    ? '#22c55e'
                                    : feature.status === 'in_progress'
                                      ? '#3b82f6'
                                      : feature.status === 'archived'
                                        ? '#eab308'
                                        : '#9ca3af',
                              }}
                              title={`${feature.title} (Score: ${feature.priorityScore ?? 'N/A'})`}
                            >
                              {feature.title.charAt(0).toUpperCase()}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* X-axis label */}
              <div className="flex justify-between mt-1 px-1">
                <span className="text-[10px] text-gray-400">Low Effort</span>
                <span className="text-xs font-medium text-gray-500">Effort</span>
                <span className="text-[10px] text-gray-400">High Effort</span>
              </div>
            </div>

            {/* Y-axis ticks */}
            <div className="absolute left-3 top-0 bottom-6 flex flex-col justify-between">
              <span className="text-[10px] text-gray-400">High</span>
              <span className="text-[10px] text-gray-400">Low</span>
            </div>
          </div>

          {matrixFeatures.length === 0 && (
            <p className="text-sm text-gray-400 text-center mt-4 italic">
              No features have completed Phase 2 and Phase 8 data for matrix placement.
            </p>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card p-5">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
          {recentFeatures.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No features yet.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentFeatures.map((feature) => (
                <div key={feature.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor:
                          feature.status === 'completed'
                            ? '#22c55e'
                            : feature.status === 'in_progress'
                              ? '#3b82f6'
                              : feature.status === 'archived'
                                ? '#eab308'
                                : '#9ca3af',
                      }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{feature.title}</p>
                      <p className="text-xs text-gray-500">
                        Phase {feature.currentPhase}/9
                        {feature.assigneeName && <span> &middot; {feature.assigneeName}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    {feature.priorityScore !== null && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700">
                        {feature.priorityScore}
                      </span>
                    )}
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {new Date(feature.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
