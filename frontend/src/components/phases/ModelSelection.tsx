import { useState } from 'react';

interface Experiment {
  name: string;
  summary: string;
  hypothesis: string;
  approach: string;
  effort: 'xs' | 'small' | 'medium' | 'large' | 'xl';
  effortWeeks: number;
  likelihoodOfSuccess: number;
  status: 'proposed' | 'in_progress' | 'completed' | 'abandoned';
  outcome: string;
}

const EFFORT_OPTIONS = [
  { value: 'xs', label: 'XS (< 1 week)' },
  { value: 'small', label: 'Small (1-2 weeks)' },
  { value: 'medium', label: 'Medium (2-4 weeks)' },
  { value: 'large', label: 'Large (4-8 weeks)' },
  { value: 'xl', label: 'XL (8+ weeks)' },
];

const STATUS_OPTIONS = [
  { value: 'proposed', label: 'Proposed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'abandoned', label: 'Abandoned' },
];

const EMPTY_EXPERIMENT: Experiment = {
  name: '',
  summary: '',
  hypothesis: '',
  approach: '',
  effort: 'medium',
  effortWeeks: 2,
  likelihoodOfSuccess: 50,
  status: 'proposed',
  outcome: '',
};

interface ModelSelectionProps {
  data: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => void;
}

export default function ModelSelection({ data, onSave }: ModelSelectionProps) {
  const [experiments, setExperiments] = useState<Experiment[]>(
    (data.experiments as Experiment[]) || [{ ...EMPTY_EXPERIMENT }]
  );
  const [baselineDescription, setBaselineDescription] = useState<string>(
    (data.baseline_description as string) || ''
  );
  const [successCriteria, setSuccessCriteria] = useState<string>(
    (data.success_criteria as string) || ''
  );
  const [infrastructureRequirements, setInfrastructureRequirements] = useState<string>(
    (data.infrastructure_requirements as string) || ''
  );

  const handleAddExperiment = () => {
    setExperiments([...experiments, { ...EMPTY_EXPERIMENT }]);
  };

  const handleRemoveExperiment = (index: number) => {
    setExperiments(experiments.filter((_, i) => i !== index));
  };

  const handleExperimentChange = (
    index: number,
    field: keyof Experiment,
    value: string | number
  ) => {
    const updated = experiments.map((exp, i) =>
      i === index ? { ...exp, [field]: value } : exp
    );
    setExperiments(updated);
  };

  const handleSave = () => {
    onSave({
      experiments,
      baseline_description: baselineDescription,
      success_criteria: successCriteria,
      infrastructure_requirements: infrastructureRequirements,
    });
  };

  const getLikelihoodColor = (value: number) => {
    if (value >= 70) return 'text-green-700 bg-green-100';
    if (value >= 40) return 'text-yellow-700 bg-yellow-100';
    return 'text-red-700 bg-red-100';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'proposed': return 'bg-gray-100 text-gray-700';
      case 'in_progress': return 'bg-blue-100 text-blue-700';
      case 'completed': return 'bg-green-100 text-green-700';
      case 'abandoned': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Baseline */}
      <div className="p-4 border border-gray-200 rounded-lg bg-white">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Baseline Approach</h3>
        <div className="space-y-3">
          <div>
            <label className="label">Baseline Description</label>
            <textarea
              className="input min-h-[60px]"
              value={baselineDescription}
              onChange={(e) => setBaselineDescription(e.target.value)}
              placeholder="Describe the baseline approach to compare experiments against (e.g., rule-based system, logistic regression, current production model)..."
            />
          </div>
          <div>
            <label className="label">Success Criteria for Experiments</label>
            <textarea
              className="input min-h-[60px]"
              value={successCriteria}
              onChange={(e) => setSuccessCriteria(e.target.value)}
              placeholder="What defines a successful experiment? (e.g., must beat baseline by 5% accuracy, latency < 100ms)..."
            />
          </div>
        </div>
      </div>

      {/* Experiments */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="label mb-0">Experiments</label>
          <button
            type="button"
            onClick={handleAddExperiment}
            className="text-sm px-3 py-1 bg-primary-100 text-primary-700 rounded hover:bg-primary-200 transition-colors"
          >
            + Add Experiment
          </button>
        </div>
        <div className="space-y-4">
          {experiments.map((exp, index) => (
            <div
              key={index}
              className="p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-700">
                    Experiment #{index + 1}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(exp.status)}`}>
                    {STATUS_OPTIONS.find(s => s.value === exp.status)?.label}
                  </span>
                </div>
                {experiments.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveExperiment(index)}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                )}
              </div>

              {/* Name */}
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  className="input"
                  value={exp.name}
                  onChange={(e) => handleExperimentChange(index, 'name', e.target.value)}
                  placeholder="e.g., BERT fine-tuned on domain data, YOLOv8 with thermal augmentation"
                />
              </div>

              {/* Summary */}
              <div>
                <label className="label">Summary</label>
                <textarea
                  className="input min-h-[60px]"
                  value={exp.summary}
                  onChange={(e) => handleExperimentChange(index, 'summary', e.target.value)}
                  placeholder="Brief description of what this experiment will test and the overall approach..."
                />
              </div>

              {/* Hypothesis */}
              <div>
                <label className="label">Hypothesis</label>
                <textarea
                  className="input min-h-[60px]"
                  value={exp.hypothesis}
                  onChange={(e) => handleExperimentChange(index, 'hypothesis', e.target.value)}
                  placeholder="e.g., We believe that fine-tuning BERT on our domain-specific corpus will improve classification F1 by 10% over the generic model because..."
                />
              </div>

              {/* Approach / Model Details */}
              <div>
                <label className="label">Approach / Model Details</label>
                <textarea
                  className="input min-h-[60px]"
                  value={exp.approach}
                  onChange={(e) => handleExperimentChange(index, 'approach', e.target.value)}
                  placeholder="Model architecture, training strategy, hyperparameters, data preprocessing steps..."
                />
              </div>

              {/* Effort + Likelihood row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="label">Effort (T-shirt)</label>
                  <select
                    className="input"
                    value={exp.effort}
                    onChange={(e) => handleExperimentChange(index, 'effort', e.target.value)}
                  >
                    {EFFORT_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Effort (weeks)</label>
                  <input
                    type="number"
                    className="input"
                    value={exp.effortWeeks}
                    onChange={(e) => handleExperimentChange(index, 'effortWeeks', Number(e.target.value))}
                    min={0}
                    step={0.5}
                  />
                </div>
                <div>
                  <label className="label">Likelihood of Success</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      className="flex-1 h-2 rounded-lg appearance-none cursor-pointer accent-primary-600"
                      value={exp.likelihoodOfSuccess}
                      onChange={(e) => handleExperimentChange(index, 'likelihoodOfSuccess', Number(e.target.value))}
                      min={0}
                      max={100}
                    />
                    <span className={`text-sm font-semibold px-2 py-0.5 rounded ${getLikelihoodColor(exp.likelihoodOfSuccess)}`}>
                      {exp.likelihoodOfSuccess}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label">Status</label>
                  <select
                    className="input"
                    value={exp.status}
                    onChange={(e) => handleExperimentChange(index, 'status', e.target.value)}
                  >
                    {STATUS_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                {(exp.status === 'completed' || exp.status === 'abandoned') && (
                  <div>
                    <label className="label">Outcome / Results</label>
                    <input
                      type="text"
                      className="input"
                      value={exp.outcome}
                      onChange={(e) => handleExperimentChange(index, 'outcome', e.target.value)}
                      placeholder={exp.status === 'completed' ? 'Results achieved...' : 'Reason for abandoning...'}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Experiment Summary Table */}
      {experiments.length > 1 && experiments.some(e => e.name) && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <h3 className="text-sm font-semibold text-gray-800 px-4 py-2 bg-gray-50 border-b border-gray-200">
            Experiment Comparison
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-2 font-medium text-gray-600">Experiment</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Effort</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Likelihood</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {experiments.filter(e => e.name).map((exp, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium text-gray-800">{exp.name}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {EFFORT_OPTIONS.find(o => o.value === exp.effort)?.label} ({exp.effortWeeks}w)
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${getLikelihoodColor(exp.likelihoodOfSuccess)}`}>
                        {exp.likelihoodOfSuccess}%
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(exp.status)}`}>
                        {STATUS_OPTIONS.find(s => s.value === exp.status)?.label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Infrastructure */}
      <div>
        <label className="label">Infrastructure Requirements</label>
        <textarea
          className="input min-h-[60px]"
          value={infrastructureRequirements}
          onChange={(e) => setInfrastructureRequirements(e.target.value)}
          placeholder="GPU requirements, memory, storage, serving infrastructure, experiment tracking tools..."
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
