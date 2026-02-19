import { useState, useEffect } from 'react';

interface FinalPrioritizationProps {
  data: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => void;
  computeScore?: () => number;
}

export default function FinalPrioritization({
  data,
  onSave,
  computeScore,
}: FinalPrioritizationProps) {
  const [priorityScore, setPriorityScore] = useState<number>(
    (data.priority_score as number) || 0
  );
  const [roadmapQuarter, setRoadmapQuarter] = useState<string>(
    (data.roadmap_quarter as string) || ''
  );
  const [roadmapTier, setRoadmapTier] = useState<string>(
    (data.roadmap_tier as string) || 'later'
  );
  const [finalDecision, setFinalDecision] = useState<string>(
    (data.final_decision as string) || ''
  );
  const [decisionRationale, setDecisionRationale] = useState<string>(
    (data.decision_rationale as string) || ''
  );
  const [reviewer, setReviewer] = useState<string>(
    (data.reviewer as string) || ''
  );

  useEffect(() => {
    if (computeScore) {
      setPriorityScore(computeScore());
    }
  }, [computeScore]);

  const getScoreColor = (score: number) => {
    if (score >= 7) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 4) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'now':
        return 'bg-green-100 text-green-800';
      case 'next':
        return 'bg-blue-100 text-blue-800';
      case 'later':
        return 'bg-yellow-100 text-yellow-800';
      case 'icebox':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleSave = () => {
    onSave({
      priority_score: priorityScore,
      roadmap_quarter: roadmapQuarter,
      roadmap_tier: roadmapTier,
      final_decision: finalDecision,
      decision_rationale: decisionRationale,
      reviewer,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="label">Priority Score</label>
        <div
          className={`inline-flex items-center justify-center w-24 h-24 rounded-xl border-2 ${getScoreColor(priorityScore)}`}
        >
          <span className="text-4xl font-bold">{priorityScore}</span>
        </div>
        {computeScore && (
          <p className="text-xs text-gray-500 mt-1">
            Auto-computed from previous phase data
          </p>
        )}
        <div className="mt-2 space-y-1 text-xs text-gray-500">
          <div><span className="font-medium text-gray-600">1-3:</span> Low priority — limited business impact, high risk, or poor data readiness; consider deferring or rejecting</div>
          <div><span className="font-medium text-gray-600">4-6:</span> Medium priority — viable project with moderate ROI; schedule for upcoming quarter if resources allow</div>
          <div><span className="font-medium text-gray-600">7-10:</span> High priority — strong business case, manageable risk, good data readiness; prioritize for immediate execution</div>
        </div>
      </div>

      <div>
        <label className="label">Roadmap Quarter</label>
        <input
          type="text"
          className="input"
          value={roadmapQuarter}
          onChange={(e) => setRoadmapQuarter(e.target.value)}
          placeholder="e.g., Q1 2026"
        />
      </div>

      <div>
        <label className="label">Roadmap Tier</label>
        <select
          className="input"
          value={roadmapTier}
          onChange={(e) => setRoadmapTier(e.target.value)}
        >
          <option value="now">Now</option>
          <option value="next">Next</option>
          <option value="later">Later</option>
          <option value="icebox">Icebox</option>
        </select>
        <div className="mt-2">
          <span
            className={`inline-block px-3 py-1 text-sm font-medium rounded-full ${getTierColor(roadmapTier)}`}
          >
            {roadmapTier.charAt(0).toUpperCase() + roadmapTier.slice(1)}
          </span>
        </div>
        <div className="mt-2 space-y-1 text-xs text-gray-500">
          <div><span className="font-medium text-gray-600">Now:</span> Active development this quarter; team assigned, resources allocated (score 7+, data ready)</div>
          <div><span className="font-medium text-gray-600">Next:</span> Planned for next quarter; dependencies being resolved (score 5-7, needs some prep work)</div>
          <div><span className="font-medium text-gray-600">Later:</span> On the roadmap but not yet prioritized; revisit in 2-3 quarters (score 4-6, data gaps remain)</div>
          <div><span className="font-medium text-gray-600">Icebox:</span> Parked indefinitely; interesting idea but not viable now (score &lt;4, or blocked by major dependencies)</div>
        </div>
      </div>

      <div>
        <label className="label">Final Decision</label>
        <div className="flex gap-6 mt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="final_decision"
              value="approved"
              checked={finalDecision === 'approved'}
              onChange={(e) => setFinalDecision(e.target.value)}
              className="text-green-600 focus:ring-green-500"
            />
            <span className="text-sm text-gray-700">Approved</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="final_decision"
              value="deferred"
              checked={finalDecision === 'deferred'}
              onChange={(e) => setFinalDecision(e.target.value)}
              className="text-yellow-600 focus:ring-yellow-500"
            />
            <span className="text-sm text-gray-700">Deferred</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="final_decision"
              value="rejected"
              checked={finalDecision === 'rejected'}
              onChange={(e) => setFinalDecision(e.target.value)}
              className="text-red-600 focus:ring-red-500"
            />
            <span className="text-sm text-gray-700">Rejected</span>
          </label>
        </div>
        <div className="mt-2 space-y-1 text-xs text-gray-500">
          <div><span className="font-medium text-gray-600">Approved:</span> All phases pass review; team is allocated; development begins (e.g., score 8, data ready, Go decision in Phase 2)</div>
          <div><span className="font-medium text-gray-600">Deferred:</span> Promising but blocked; revisit when conditions change (e.g., waiting on data pipeline, budget cycle, or team availability)</div>
          <div><span className="font-medium text-gray-600">Rejected:</span> Does not meet criteria; close this feature (e.g., No-Go in Phase 2, ML unnecessary in Phase 3, or score &lt;3)</div>
        </div>
      </div>

      <div>
        <label className="label">Decision Rationale</label>
        <textarea
          className="input min-h-[100px]"
          value={decisionRationale}
          onChange={(e) => setDecisionRationale(e.target.value)}
          placeholder="e.g., Approved: Strong business case (reward 9/10), manageable risk with mitigation plan, 50K labeled images ready, team experienced with similar CV tasks. Targeting Q2 2026 launch with 3-person team."
        />
      </div>

      <div>
        <label className="label">Reviewer</label>
        <input
          type="text"
          className="input"
          value={reviewer}
          onChange={(e) => setReviewer(e.target.value)}
          placeholder="Name of the reviewer or decision maker"
        />
      </div>

      <div className="pt-4">
        <button type="button" className="btn-primary" onClick={handleSave}>
          Save Phase Data
        </button>
      </div>
    </div>
  );
}
