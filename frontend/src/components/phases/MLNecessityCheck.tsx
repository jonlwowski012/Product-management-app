import { useState } from 'react';

interface Alternative {
  approach: string;
  pros: string;
  cons: string;
}

interface MLNecessityCheckProps {
  data: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => void;
}

export default function MLNecessityCheck({ data, onSave }: MLNecessityCheckProps) {
  const [alternativesConsidered, setAlternativesConsidered] = useState<Alternative[]>(
    (data.alternatives_considered as Alternative[]) || [{ approach: '', pros: '', cons: '' }]
  );
  const [whyMlNeeded, setWhyMlNeeded] = useState<string>(
    (data.why_ml_needed as string) || ''
  );
  const [mlIsNecessary, setMlIsNecessary] = useState<boolean>(
    (data.ml_is_necessary as boolean) || false
  );
  const [complexityJustification, setComplexityJustification] = useState<string>(
    (data.complexity_justification as string) || ''
  );
  const [simplerBaseline, setSimplerBaseline] = useState<string>(
    (data.simpler_baseline as string) || ''
  );

  const handleAddAlternative = () => {
    setAlternativesConsidered([
      ...alternativesConsidered,
      { approach: '', pros: '', cons: '' },
    ]);
  };

  const handleRemoveAlternative = (index: number) => {
    setAlternativesConsidered(alternativesConsidered.filter((_, i) => i !== index));
  };

  const handleAlternativeChange = (
    index: number,
    field: keyof Alternative,
    value: string
  ) => {
    const updated = alternativesConsidered.map((alt, i) =>
      i === index ? { ...alt, [field]: value } : alt
    );
    setAlternativesConsidered(updated);
  };

  const handleSave = () => {
    onSave({
      alternatives_considered: alternativesConsidered,
      why_ml_needed: whyMlNeeded,
      ml_is_necessary: mlIsNecessary,
      complexity_justification: complexityJustification,
      simpler_baseline: simplerBaseline,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="label mb-0">Alternatives Considered</label>
          <button
            type="button"
            onClick={handleAddAlternative}
            className="text-sm px-3 py-1 bg-primary-100 text-primary-700 rounded hover:bg-primary-200 transition-colors"
          >
            + Add Alternative
          </button>
        </div>
        <div className="space-y-4">
          {alternativesConsidered.map((alt, index) => (
            <div
              key={index}
              className="p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">
                  Alternative #{index + 1}
                </span>
                {alternativesConsidered.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveAlternative(index)}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div>
                <label className="label">Approach</label>
                <input
                  type="text"
                  className="input"
                  value={alt.approach}
                  onChange={(e) =>
                    handleAlternativeChange(index, 'approach', e.target.value)
                  }
                  placeholder="e.g., Rule-based thresholding, lookup table, manual review process, heuristic scoring"
                />
              </div>
              <div>
                <label className="label">Pros</label>
                <input
                  type="text"
                  className="input"
                  value={alt.pros}
                  onChange={(e) =>
                    handleAlternativeChange(index, 'pros', e.target.value)
                  }
                  placeholder="e.g., Simple to implement, no training data needed, fully explainable, low maintenance"
                />
              </div>
              <div>
                <label className="label">Cons</label>
                <input
                  type="text"
                  className="input"
                  value={alt.cons}
                  onChange={(e) =>
                    handleAlternativeChange(index, 'cons', e.target.value)
                  }
                  placeholder="e.g., Can't handle edge cases, doesn't scale to new defect types, accuracy caps at 70%"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Why is ML Needed?</label>
        <textarea
          className="input min-h-[100px]"
          value={whyMlNeeded}
          onChange={(e) => setWhyMlNeeded(e.target.value)}
          placeholder="e.g., The problem requires recognizing visual patterns (cracks, hotspots) across highly variable conditions. Rule-based approaches can't generalize to new panel types, lighting, or defect variants. ML enables learning from examples rather than manually coding every pattern."
        />
      </div>

      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={mlIsNecessary}
            onChange={(e) => setMlIsNecessary(e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm font-medium text-gray-700">
            ML is necessary for this feature
          </span>
        </label>
        <p className="mt-1 ml-8 text-xs text-gray-500">
          Check this only if alternatives above cannot achieve the success criteria. If a simpler approach gets 80% of the way there, consider starting with that as a baseline.
        </p>
      </div>

      <div>
        <label className="label">Complexity Justification</label>
        <textarea
          className="input min-h-[80px]"
          value={complexityJustification}
          onChange={(e) => setComplexityJustification(e.target.value)}
          placeholder="e.g., ML adds training pipeline, monitoring, and data dependency overhead, but is justified because the pattern space is too large for manual rules (1000s of defect variants) and accuracy requirements (>95%) exceed what heuristics achieve"
        />
      </div>

      <div>
        <label className="label">Simpler Baseline</label>
        <input
          type="text"
          className="input"
          value={simplerBaseline}
          onChange={(e) => setSimplerBaseline(e.target.value)}
          placeholder="e.g., Threshold-based anomaly detection on pixel intensity; if ML doesn't beat this by 15%+ accuracy, revert to simpler approach"
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
