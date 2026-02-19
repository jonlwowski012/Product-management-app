import { useState, KeyboardEvent } from 'react';

interface BusinessRequirementsProps {
  data: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => void;
}

export default function BusinessRequirements({ data, onSave }: BusinessRequirementsProps) {
  const [problemStatement, setProblemStatement] = useState<string>(
    (data.problem_statement as string) || ''
  );
  const [targetUsers, setTargetUsers] = useState<string>(
    (data.target_users as string) || ''
  );
  const [successCriteria, setSuccessCriteria] = useState<string>(
    (data.success_criteria as string) || ''
  );
  const [businessMetricsImpacted, setBusinessMetricsImpacted] = useState<string[]>(
    (data.business_metrics_impacted as string[]) || []
  );
  const [metricsInput, setMetricsInput] = useState('');
  const [currentSolution, setCurrentSolution] = useState<string>(
    (data.current_solution as string) || ''
  );
  const [stakeholders, setStakeholders] = useState<string[]>(
    (data.stakeholders as string[]) || []
  );
  const [stakeholderInput, setStakeholderInput] = useState('');
  const [deadlinePressure, setDeadlinePressure] = useState<string>(
    (data.deadline_pressure as string) || 'low'
  );

  const handleAddMetric = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = metricsInput.trim();
      if (value && !businessMetricsImpacted.includes(value)) {
        setBusinessMetricsImpacted([...businessMetricsImpacted, value]);
      }
      setMetricsInput('');
    }
  };

  const handleRemoveMetric = (metric: string) => {
    setBusinessMetricsImpacted(businessMetricsImpacted.filter((m) => m !== metric));
  };

  const handleAddStakeholder = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = stakeholderInput.trim();
      if (value && !stakeholders.includes(value)) {
        setStakeholders([...stakeholders, value]);
      }
      setStakeholderInput('');
    }
  };

  const handleRemoveStakeholder = (stakeholder: string) => {
    setStakeholders(stakeholders.filter((s) => s !== stakeholder));
  };

  const handleSave = () => {
    onSave({
      problem_statement: problemStatement,
      target_users: targetUsers,
      success_criteria: successCriteria,
      business_metrics_impacted: businessMetricsImpacted,
      current_solution: currentSolution,
      stakeholders,
      deadline_pressure: deadlinePressure,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="label">Problem Statement</label>
        <textarea
          className="input min-h-[100px]"
          value={problemStatement}
          onChange={(e) => setProblemStatement(e.target.value)}
          placeholder="Describe the problem this feature aims to solve..."
        />
      </div>

      <div>
        <label className="label">Target Users</label>
        <input
          type="text"
          className="input"
          value={targetUsers}
          onChange={(e) => setTargetUsers(e.target.value)}
          placeholder="e.g., Enterprise customers, Data analysts"
        />
      </div>

      <div>
        <label className="label">Success Criteria</label>
        <textarea
          className="input min-h-[80px]"
          value={successCriteria}
          onChange={(e) => setSuccessCriteria(e.target.value)}
          placeholder="What does success look like for this feature?"
        />
      </div>

      <div>
        <label className="label">Business Metrics Impacted</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {businessMetricsImpacted.map((metric) => (
            <span
              key={metric}
              className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 text-primary-800 text-sm rounded-full"
            >
              {metric}
              <button
                type="button"
                onClick={() => handleRemoveMetric(metric)}
                className="ml-1 text-primary-600 hover:text-primary-900 font-bold"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
        <input
          type="text"
          className="input"
          value={metricsInput}
          onChange={(e) => setMetricsInput(e.target.value)}
          onKeyDown={handleAddMetric}
          placeholder="Type a metric and press Enter to add..."
        />
      </div>

      <div>
        <label className="label">Current Solution</label>
        <textarea
          className="input min-h-[80px]"
          value={currentSolution}
          onChange={(e) => setCurrentSolution(e.target.value)}
          placeholder="What is the current solution or workaround?"
        />
      </div>

      <div>
        <label className="label">Stakeholders</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {stakeholders.map((stakeholder) => (
            <span
              key={stakeholder}
              className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 text-primary-800 text-sm rounded-full"
            >
              {stakeholder}
              <button
                type="button"
                onClick={() => handleRemoveStakeholder(stakeholder)}
                className="ml-1 text-primary-600 hover:text-primary-900 font-bold"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
        <input
          type="text"
          className="input"
          value={stakeholderInput}
          onChange={(e) => setStakeholderInput(e.target.value)}
          onKeyDown={handleAddStakeholder}
          placeholder="Type a stakeholder name and press Enter to add..."
        />
      </div>

      <div>
        <label className="label">Deadline Pressure</label>
        <select
          className="input"
          value={deadlinePressure}
          onChange={(e) => setDeadlinePressure(e.target.value)}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>

      <div className="pt-4">
        <button type="button" className="btn-primary" onClick={handleSave}>
          Save Phase Data
        </button>
      </div>
    </div>
  );
}
