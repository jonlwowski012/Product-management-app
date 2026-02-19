import { useState } from 'react';
import ScoreSlider from '../common/ScoreSlider';

interface Risk {
  description: string;
  severity: string;
  mitigation: string;
}

interface RiskRewardProps {
  data: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => void;
}

export default function RiskReward({ data, onSave }: RiskRewardProps) {
  const [potentialReward, setPotentialReward] = useState<string>(
    (data.potential_reward as string) || ''
  );
  const [rewardScore, setRewardScore] = useState<number>(
    (data.reward_score as number) || 5
  );
  const [risks, setRisks] = useState<Risk[]>(
    (data.risks as Risk[]) || [{ description: '', severity: 'low', mitigation: '' }]
  );
  const [riskScore, setRiskScore] = useState<number>(
    (data.risk_score as number) || 5
  );
  const [goNoGo, setGoNoGo] = useState<string>(
    (data.go_no_go as string) || ''
  );

  const handleAddRisk = () => {
    setRisks([...risks, { description: '', severity: 'low', mitigation: '' }]);
  };

  const handleRemoveRisk = (index: number) => {
    setRisks(risks.filter((_, i) => i !== index));
  };

  const handleRiskChange = (index: number, field: keyof Risk, value: string) => {
    const updated = risks.map((risk, i) =>
      i === index ? { ...risk, [field]: value } : risk
    );
    setRisks(updated);
  };

  const handleSave = () => {
    onSave({
      potential_reward: potentialReward,
      reward_score: rewardScore,
      risks,
      risk_score: riskScore,
      go_no_go: goNoGo,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="label">Potential Reward</label>
        <textarea
          className="input min-h-[100px]"
          value={potentialReward}
          onChange={(e) => setPotentialReward(e.target.value)}
          placeholder="e.g., Automating defect detection could reduce inspection costs by $500K/year, improve detection accuracy from 85% to 97%, and enable same-day reporting for customers"
        />
      </div>

      <ScoreSlider
        label="Reward Score"
        value={rewardScore}
        onChange={setRewardScore}
        min={1}
        max={10}
        levels={[
          { range: '1-3', label: 'Low', description: 'Marginal improvement; nice-to-have with limited business impact (e.g., minor UX polish)' },
          { range: '4-6', label: 'Medium', description: 'Meaningful efficiency gain or cost savings; measurable ROI (e.g., 20% faster processing)' },
          { range: '7-10', label: 'High', description: 'Transformative impact; new revenue stream, major cost reduction, or competitive moat (e.g., 10x throughput)' },
        ]}
      />

      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="label mb-0">Risks</label>
          <button
            type="button"
            onClick={handleAddRisk}
            className="text-sm px-3 py-1 bg-primary-100 text-primary-700 rounded hover:bg-primary-200 transition-colors"
          >
            + Add Risk
          </button>
        </div>
        <div className="space-y-4">
          {risks.map((risk, index) => (
            <div
              key={index}
              className="p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">
                  Risk #{index + 1}
                </span>
                {risks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveRisk(index)}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div>
                <label className="label">Description</label>
                <input
                  type="text"
                  className="input"
                  value={risk.description}
                  onChange={(e) => handleRiskChange(index, 'description', e.target.value)}
                  placeholder="e.g., Model may not generalize across different panel manufacturers"
                />
              </div>
              <div>
                <label className="label">Severity</label>
                <select
                  className="input"
                  value={risk.severity}
                  onChange={(e) => handleRiskChange(index, 'severity', e.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
                <div className="mt-1 text-xs text-gray-500">
                  <span className="font-medium text-gray-600">Low:</span> Workaround exists, minor delay.{' '}
                  <span className="font-medium text-gray-600">Medium:</span> Significant rework or partial failure.{' '}
                  <span className="font-medium text-gray-600">High:</span> Project failure, safety concern, or reputational damage.
                </div>
              </div>
              <div>
                <label className="label">Mitigation</label>
                <input
                  type="text"
                  className="input"
                  value={risk.mitigation}
                  onChange={(e) => handleRiskChange(index, 'mitigation', e.target.value)}
                  placeholder="e.g., Collect training data from 5+ manufacturers; implement confidence thresholds with human review fallback"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <ScoreSlider
        label="Risk Score"
        value={riskScore}
        onChange={setRiskScore}
        min={1}
        max={10}
        levels={[
          { range: '1-3', label: 'Low', description: 'Well-understood problem; proven approach; risks are manageable with standard practices' },
          { range: '4-6', label: 'Medium', description: 'Some unknowns; data quality or model performance may require iteration' },
          { range: '7-10', label: 'High', description: 'Novel problem; critical safety/compliance concerns; high chance of significant rework or failure' },
        ]}
      />

      <div>
        <label className="label">Go / No-Go Decision</label>
        <div className="flex gap-6 mt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="go_no_go"
              value="go"
              checked={goNoGo === 'go'}
              onChange={(e) => setGoNoGo(e.target.value)}
              className="text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">Go</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="go_no_go"
              value="no_go"
              checked={goNoGo === 'no_go'}
              onChange={(e) => setGoNoGo(e.target.value)}
              className="text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">No Go</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="go_no_go"
              value="needs_more_info"
              checked={goNoGo === 'needs_more_info'}
              onChange={(e) => setGoNoGo(e.target.value)}
              className="text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">Needs More Info</span>
          </label>
        </div>
        <div className="mt-2 space-y-1 text-xs text-gray-500">
          <div><span className="font-medium text-gray-600">Go:</span> Reward justifies risk; proceed to next phase (e.g., reward 8, risk 4 — clear ROI with manageable risk)</div>
          <div><span className="font-medium text-gray-600">No Go:</span> Risk outweighs reward; stop here (e.g., reward 3, risk 9 — low upside with major uncertainty)</div>
          <div><span className="font-medium text-gray-600">Needs More Info:</span> Can't decide yet; need data, POC, or stakeholder input before committing</div>
        </div>
      </div>

      <div className="pt-4">
        <button type="button" className="btn-primary" onClick={handleSave}>
          Save Phase Data
        </button>
      </div>
    </div>
  );
}
