import { useState } from 'react';

interface ModelCandidate {
  name: string;
  type: string;
  rationale: string;
  complexity: string;
}

interface ModelSelectionProps {
  data: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => void;
}

export default function ModelSelection({ data, onSave }: ModelSelectionProps) {
  const [modelCandidates, setModelCandidates] = useState<ModelCandidate[]>(
    (data.model_candidates as ModelCandidate[]) || [
      { name: '', type: '', rationale: '', complexity: 'low' },
    ]
  );
  const [selectedModel, setSelectedModel] = useState<string>(
    (data.selected_model as string) || ''
  );
  const [isSota, setIsSota] = useState<boolean>(
    (data.is_sota as boolean) || false
  );
  const [sotaJustification, setSotaJustification] = useState<string>(
    (data.sota_justification as string) || ''
  );
  const [baselineModel, setBaselineModel] = useState<string>(
    (data.baseline_model as string) || ''
  );
  const [infrastructureRequirements, setInfrastructureRequirements] = useState<string>(
    (data.infrastructure_requirements as string) || ''
  );

  const handleAddCandidate = () => {
    setModelCandidates([
      ...modelCandidates,
      { name: '', type: '', rationale: '', complexity: 'low' },
    ]);
  };

  const handleRemoveCandidate = (index: number) => {
    setModelCandidates(modelCandidates.filter((_, i) => i !== index));
  };

  const handleCandidateChange = (
    index: number,
    field: keyof ModelCandidate,
    value: string
  ) => {
    const updated = modelCandidates.map((candidate, i) =>
      i === index ? { ...candidate, [field]: value } : candidate
    );
    setModelCandidates(updated);
  };

  const handleSave = () => {
    onSave({
      model_candidates: modelCandidates,
      selected_model: selectedModel,
      is_sota: isSota,
      sota_justification: sotaJustification,
      baseline_model: baselineModel,
      infrastructure_requirements: infrastructureRequirements,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="label mb-0">Model Candidates</label>
          <button
            type="button"
            onClick={handleAddCandidate}
            className="text-sm px-3 py-1 bg-primary-100 text-primary-700 rounded hover:bg-primary-200 transition-colors"
          >
            + Add Candidate
          </button>
        </div>
        <div className="space-y-4">
          {modelCandidates.map((candidate, index) => (
            <div
              key={index}
              className="p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">
                  Candidate #{index + 1}
                </span>
                {modelCandidates.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveCandidate(index)}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  className="input"
                  value={candidate.name}
                  onChange={(e) =>
                    handleCandidateChange(index, 'name', e.target.value)
                  }
                  placeholder="e.g., BERT-base, XGBoost, ResNet-50"
                />
              </div>
              <div>
                <label className="label">Type</label>
                <input
                  type="text"
                  className="input"
                  value={candidate.type}
                  onChange={(e) =>
                    handleCandidateChange(index, 'type', e.target.value)
                  }
                  placeholder="e.g., Transformer, Gradient Boosting, CNN"
                />
              </div>
              <div>
                <label className="label">Rationale</label>
                <input
                  type="text"
                  className="input"
                  value={candidate.rationale}
                  onChange={(e) =>
                    handleCandidateChange(index, 'rationale', e.target.value)
                  }
                  placeholder="Why this model is being considered..."
                />
              </div>
              <div>
                <label className="label">Complexity</label>
                <select
                  className="input"
                  value={candidate.complexity}
                  onChange={(e) =>
                    handleCandidateChange(index, 'complexity', e.target.value)
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Selected Model</label>
        <input
          type="text"
          className="input"
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          placeholder="Name of the selected model..."
        />
      </div>

      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isSota}
            onChange={(e) => setIsSota(e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm font-medium text-gray-700">
            This is a state-of-the-art (SOTA) model
          </span>
        </label>
        {isSota && (
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-300 rounded-lg">
            <p className="text-sm text-yellow-800 font-medium">
              SOTA models add complexity. Consider proven models first.
            </p>
          </div>
        )}
      </div>

      {isSota && (
        <div>
          <label className="label">
            SOTA Justification <span className="text-red-500">*</span>
          </label>
          <textarea
            className="input min-h-[80px]"
            value={sotaJustification}
            onChange={(e) => setSotaJustification(e.target.value)}
            placeholder="Explain why a SOTA model is required over proven alternatives..."
            required
          />
        </div>
      )}

      <div>
        <label className="label">Baseline Model</label>
        <input
          type="text"
          className="input"
          value={baselineModel}
          onChange={(e) => setBaselineModel(e.target.value)}
          placeholder="e.g., Logistic Regression, Rule-based system"
        />
      </div>

      <div>
        <label className="label">Infrastructure Requirements</label>
        <textarea
          className="input min-h-[80px]"
          value={infrastructureRequirements}
          onChange={(e) => setInfrastructureRequirements(e.target.value)}
          placeholder="GPU requirements, memory, storage, serving infrastructure..."
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
