import { useState } from 'react';

interface AcademicMetric {
  name: string;
  target: string;
}

interface BusinessMetric {
  name: string;
  current_value: string;
  target_value: string;
  measurement_method: string;
}

interface EvaluationStrategyProps {
  data: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => void;
}

export default function EvaluationStrategy({ data, onSave }: EvaluationStrategyProps) {
  const [academicMetrics, setAcademicMetrics] = useState<AcademicMetric[]>(
    (data.academic_metrics as AcademicMetric[]) || [{ name: '', target: '' }]
  );
  const [businessMetrics, setBusinessMetrics] = useState<BusinessMetric[]>(
    (data.business_metrics as BusinessMetric[]) || [
      { name: '', current_value: '', target_value: '', measurement_method: '' },
    ]
  );
  const [evaluationDataset, setEvaluationDataset] = useState<string>(
    (data.evaluation_dataset as string) || ''
  );
  const [abTestPlan, setAbTestPlan] = useState<string>(
    (data.ab_test_plan as string) || ''
  );
  const [minimumViablePerformance, setMinimumViablePerformance] = useState<string>(
    (data.minimum_viable_performance as string) || ''
  );

  const handleAddAcademicMetric = () => {
    setAcademicMetrics([...academicMetrics, { name: '', target: '' }]);
  };

  const handleRemoveAcademicMetric = (index: number) => {
    setAcademicMetrics(academicMetrics.filter((_, i) => i !== index));
  };

  const handleAcademicMetricChange = (
    index: number,
    field: keyof AcademicMetric,
    value: string
  ) => {
    const updated = academicMetrics.map((metric, i) =>
      i === index ? { ...metric, [field]: value } : metric
    );
    setAcademicMetrics(updated);
  };

  const handleAddBusinessMetric = () => {
    setBusinessMetrics([
      ...businessMetrics,
      { name: '', current_value: '', target_value: '', measurement_method: '' },
    ]);
  };

  const handleRemoveBusinessMetric = (index: number) => {
    setBusinessMetrics(businessMetrics.filter((_, i) => i !== index));
  };

  const handleBusinessMetricChange = (
    index: number,
    field: keyof BusinessMetric,
    value: string
  ) => {
    const updated = businessMetrics.map((metric, i) =>
      i === index ? { ...metric, [field]: value } : metric
    );
    setBusinessMetrics(updated);
  };

  const handleSave = () => {
    onSave({
      academic_metrics: academicMetrics,
      business_metrics: businessMetrics,
      evaluation_dataset: evaluationDataset,
      ab_test_plan: abTestPlan,
      minimum_viable_performance: minimumViablePerformance,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="label mb-0">Academic Metrics</label>
          <button
            type="button"
            onClick={handleAddAcademicMetric}
            className="text-sm px-3 py-1 bg-primary-100 text-primary-700 rounded hover:bg-primary-200 transition-colors"
          >
            + Add Metric
          </button>
        </div>
        <div className="space-y-3">
          {academicMetrics.map((metric, index) => (
            <div
              key={index}
              className="p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">
                  Metric #{index + 1}
                </span>
                {academicMetrics.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveAcademicMetric(index)}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Name</label>
                  <input
                    type="text"
                    className="input"
                    value={metric.name}
                    onChange={(e) =>
                      handleAcademicMetricChange(index, 'name', e.target.value)
                    }
                    placeholder="e.g., F1 Score, AUC-ROC"
                  />
                </div>
                <div>
                  <label className="label">Target</label>
                  <input
                    type="text"
                    className="input"
                    value={metric.target}
                    onChange={(e) =>
                      handleAcademicMetricChange(index, 'target', e.target.value)
                    }
                    placeholder="e.g., > 0.85"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="label mb-0">Business Metrics</label>
          <button
            type="button"
            onClick={handleAddBusinessMetric}
            className="text-sm px-3 py-1 bg-primary-100 text-primary-700 rounded hover:bg-primary-200 transition-colors"
          >
            + Add Metric
          </button>
        </div>
        <div className="space-y-3">
          {businessMetrics.map((metric, index) => (
            <div
              key={index}
              className="p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">
                  Metric #{index + 1}
                </span>
                {businessMetrics.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveBusinessMetric(index)}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Name</label>
                  <input
                    type="text"
                    className="input"
                    value={metric.name}
                    onChange={(e) =>
                      handleBusinessMetricChange(index, 'name', e.target.value)
                    }
                    placeholder="e.g., Conversion rate"
                  />
                </div>
                <div>
                  <label className="label">Current Value</label>
                  <input
                    type="text"
                    className="input"
                    value={metric.current_value}
                    onChange={(e) =>
                      handleBusinessMetricChange(index, 'current_value', e.target.value)
                    }
                    placeholder="e.g., 2.5%"
                  />
                </div>
                <div>
                  <label className="label">Target Value</label>
                  <input
                    type="text"
                    className="input"
                    value={metric.target_value}
                    onChange={(e) =>
                      handleBusinessMetricChange(index, 'target_value', e.target.value)
                    }
                    placeholder="e.g., 4.0%"
                  />
                </div>
                <div>
                  <label className="label">Measurement Method</label>
                  <input
                    type="text"
                    className="input"
                    value={metric.measurement_method}
                    onChange={(e) =>
                      handleBusinessMetricChange(
                        index,
                        'measurement_method',
                        e.target.value
                      )
                    }
                    placeholder="e.g., Google Analytics"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Evaluation Dataset</label>
        <input
          type="text"
          className="input"
          value={evaluationDataset}
          onChange={(e) => setEvaluationDataset(e.target.value)}
          placeholder="Describe or link to the evaluation dataset..."
        />
      </div>

      <div>
        <label className="label">A/B Test Plan</label>
        <textarea
          className="input min-h-[100px]"
          value={abTestPlan}
          onChange={(e) => setAbTestPlan(e.target.value)}
          placeholder="Describe the A/B testing strategy, traffic split, duration, etc."
        />
      </div>

      <div>
        <label className="label">Minimum Viable Performance</label>
        <input
          type="text"
          className="input"
          value={minimumViablePerformance}
          onChange={(e) => setMinimumViablePerformance(e.target.value)}
          placeholder="What is the minimum acceptable performance for launch?"
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
