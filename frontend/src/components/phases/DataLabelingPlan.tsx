import { useState } from 'react';

interface DataLabelingPlanProps {
  data: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => void;
}

export default function DataLabelingPlan({ data, onSave }: DataLabelingPlanProps) {
  const [labelingApproach, setLabelingApproach] = useState<string>(
    (data.labeling_approach as string) || 'in_house'
  );
  const [estimatedLabelsNeeded, setEstimatedLabelsNeeded] = useState<number>(
    (data.estimated_labels_needed as number) || 0
  );
  const [labelingGuidelinesReady, setLabelingGuidelinesReady] = useState<boolean>(
    (data.labeling_guidelines_ready as boolean) || false
  );
  const [estimatedTimeWeeks, setEstimatedTimeWeeks] = useState<number>(
    (data.estimated_time_weeks as number) || 0
  );
  const [estimatedCost, setEstimatedCost] = useState<string>(
    (data.estimated_cost as string) || ''
  );
  const [qualityAssurancePlan, setQualityAssurancePlan] = useState<string>(
    (data.quality_assurance_plan as string) || ''
  );
  const [labelingTool, setLabelingTool] = useState<string>(
    (data.labeling_tool as string) || ''
  );

  const handleSave = () => {
    onSave({
      labeling_approach: labelingApproach,
      estimated_labels_needed: estimatedLabelsNeeded,
      labeling_guidelines_ready: labelingGuidelinesReady,
      estimated_time_weeks: estimatedTimeWeeks,
      estimated_cost: estimatedCost,
      quality_assurance_plan: qualityAssurancePlan,
      labeling_tool: labelingTool,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="label">Labeling Approach</label>
        <select
          className="input"
          value={labelingApproach}
          onChange={(e) => setLabelingApproach(e.target.value)}
        >
          <option value="in_house">In-House</option>
          <option value="outsourced">Outsourced</option>
          <option value="crowdsourced">Crowdsourced</option>
          <option value="automated">Automated</option>
          <option value="hybrid">Hybrid</option>
        </select>
      </div>

      <div>
        <label className="label">Estimated Labels Needed</label>
        <input
          type="number"
          className="input"
          value={estimatedLabelsNeeded}
          onChange={(e) => setEstimatedLabelsNeeded(parseInt(e.target.value) || 0)}
          placeholder="e.g., 10000"
          min={0}
        />
      </div>

      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={labelingGuidelinesReady}
            onChange={(e) => setLabelingGuidelinesReady(e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm font-medium text-gray-700">
            Labeling guidelines are ready
          </span>
        </label>
      </div>

      <div>
        <label className="label">Estimated Time (Weeks)</label>
        <input
          type="number"
          className="input"
          value={estimatedTimeWeeks}
          onChange={(e) => setEstimatedTimeWeeks(parseInt(e.target.value) || 0)}
          placeholder="e.g., 4"
          min={0}
        />
      </div>

      <div>
        <label className="label">Estimated Cost</label>
        <input
          type="text"
          className="input"
          value={estimatedCost}
          onChange={(e) => setEstimatedCost(e.target.value)}
          placeholder="e.g., $15,000"
        />
      </div>

      <div>
        <label className="label">Quality Assurance Plan</label>
        <textarea
          className="input min-h-[100px]"
          value={qualityAssurancePlan}
          onChange={(e) => setQualityAssurancePlan(e.target.value)}
          placeholder="Describe how label quality will be ensured (inter-annotator agreement, spot checks, etc.)..."
        />
      </div>

      <div>
        <label className="label">Labeling Tool</label>
        <input
          type="text"
          className="input"
          value={labelingTool}
          onChange={(e) => setLabelingTool(e.target.value)}
          placeholder="e.g., Label Studio, Prodigy, Amazon SageMaker Ground Truth"
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
