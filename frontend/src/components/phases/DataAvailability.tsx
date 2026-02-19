import { useState, KeyboardEvent } from 'react';
import ScoreSlider from '../common/ScoreSlider';

interface DataAvailabilityProps {
  data: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => void;
}

interface LabeledData {
  exists: boolean;
  volume: string;
  quality: string;
}

interface UnlabeledData {
  exists: boolean;
  volume: string;
  sources: string[];
}

export default function DataAvailability({ data, onSave }: DataAvailabilityProps) {
  const initLabeled = (data.labeled_data_available as LabeledData) || {
    exists: false,
    volume: '',
    quality: 'medium',
  };
  const initUnlabeled = (data.unlabeled_data_available as UnlabeledData) || {
    exists: false,
    volume: '',
    sources: [],
  };

  const [labeledDataExists, setLabeledDataExists] = useState<boolean>(initLabeled.exists);
  const [labeledDataVolume, setLabeledDataVolume] = useState<string>(initLabeled.volume);
  const [labeledDataQuality, setLabeledDataQuality] = useState<string>(initLabeled.quality);

  const [unlabeledDataExists, setUnlabeledDataExists] = useState<boolean>(initUnlabeled.exists);
  const [unlabeledDataVolume, setUnlabeledDataVolume] = useState<string>(initUnlabeled.volume);
  const [unlabeledDataSources, setUnlabeledDataSources] = useState<string[]>(
    initUnlabeled.sources
  );
  const [sourcesInput, setSourcesInput] = useState('');

  const [dataGaps, setDataGaps] = useState<string[]>(
    (data.data_gaps as string[]) || []
  );
  const [dataGapsInput, setDataGapsInput] = useState('');

  const [acquisitionCostEstimate, setAcquisitionCostEstimate] = useState<string>(
    (data.acquisition_cost_estimate as string) || ''
  );
  const [dataPrivacyConcerns, setDataPrivacyConcerns] = useState<string>(
    (data.data_privacy_concerns as string) || ''
  );
  const [dataReadinessScore, setDataReadinessScore] = useState<number>(
    (data.data_readiness_score as number) || 5
  );

  const handleAddSource = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = sourcesInput.trim();
      if (value && !unlabeledDataSources.includes(value)) {
        setUnlabeledDataSources([...unlabeledDataSources, value]);
      }
      setSourcesInput('');
    }
  };

  const handleRemoveSource = (source: string) => {
    setUnlabeledDataSources(unlabeledDataSources.filter((s) => s !== source));
  };

  const handleAddDataGap = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = dataGapsInput.trim();
      if (value && !dataGaps.includes(value)) {
        setDataGaps([...dataGaps, value]);
      }
      setDataGapsInput('');
    }
  };

  const handleRemoveDataGap = (gap: string) => {
    setDataGaps(dataGaps.filter((g) => g !== gap));
  };

  const handleSave = () => {
    onSave({
      labeled_data_available: {
        exists: labeledDataExists,
        volume: labeledDataVolume,
        quality: labeledDataQuality,
      },
      unlabeled_data_available: {
        exists: unlabeledDataExists,
        volume: unlabeledDataVolume,
        sources: unlabeledDataSources,
      },
      data_gaps: dataGaps,
      acquisition_cost_estimate: acquisitionCostEstimate,
      data_privacy_concerns: dataPrivacyConcerns,
      data_readiness_score: dataReadinessScore,
    });
  };

  return (
    <div className="space-y-6">
      <fieldset className="p-4 border border-gray-200 rounded-lg">
        <legend className="text-sm font-semibold text-gray-700 px-2">
          Labeled Data Available
        </legend>
        <div className="space-y-4 mt-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={labeledDataExists}
              onChange={(e) => setLabeledDataExists(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">Labeled data exists</span>
          </label>
          <div>
            <label className="label">Volume</label>
            <input
              type="text"
              className="input"
              value={labeledDataVolume}
              onChange={(e) => setLabeledDataVolume(e.target.value)}
              placeholder="e.g., 10,000 samples"
            />
          </div>
          <div>
            <label className="label">Quality</label>
            <select
              className="input"
              value={labeledDataQuality}
              onChange={(e) => setLabeledDataQuality(e.target.value)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <div className="mt-1 space-y-0.5 text-xs text-gray-500">
              <div><span className="font-medium text-gray-600">Low:</span> Noisy labels, inconsistent formats, significant missing values (e.g., scraped web data with no QA)</div>
              <div><span className="font-medium text-gray-600">Medium:</span> Usable but needs cleaning; some labeling inconsistencies (e.g., internal logs with partial annotations)</div>
              <div><span className="font-medium text-gray-600">High:</span> Clean, consistent, well-documented labels with known provenance (e.g., expert-reviewed medical images)</div>
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset className="p-4 border border-gray-200 rounded-lg">
        <legend className="text-sm font-semibold text-gray-700 px-2">
          Unlabeled Data Available
        </legend>
        <div className="space-y-4 mt-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={unlabeledDataExists}
              onChange={(e) => setUnlabeledDataExists(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">Unlabeled data exists</span>
          </label>
          <div>
            <label className="label">Volume</label>
            <input
              type="text"
              className="input"
              value={unlabeledDataVolume}
              onChange={(e) => setUnlabeledDataVolume(e.target.value)}
              placeholder="e.g., 100,000 samples"
            />
          </div>
          <div>
            <label className="label">Sources</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {unlabeledDataSources.map((source) => (
                <span
                  key={source}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 text-primary-800 text-sm rounded-full"
                >
                  {source}
                  <button
                    type="button"
                    onClick={() => handleRemoveSource(source)}
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
              value={sourcesInput}
              onChange={(e) => setSourcesInput(e.target.value)}
              onKeyDown={handleAddSource}
              placeholder="e.g., Production database, S3 data lake, partner API, web scraping, IoT sensors (press Enter to add)"
            />
          </div>
        </div>
      </fieldset>

      <div>
        <label className="label">Data Gaps</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {dataGaps.map((gap) => (
            <span
              key={gap}
              className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-800 text-sm rounded-full"
            >
              {gap}
              <button
                type="button"
                onClick={() => handleRemoveDataGap(gap)}
                className="ml-1 text-red-600 hover:text-red-900 font-bold"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
        <input
          type="text"
          className="input"
          value={dataGapsInput}
          onChange={(e) => setDataGapsInput(e.target.value)}
          onKeyDown={handleAddDataGap}
          placeholder="e.g., No nighttime imagery, missing edge-case defects, no data from manufacturer X (press Enter to add)"
        />
      </div>

      <div>
        <label className="label">Acquisition Cost Estimate</label>
        <input
          type="text"
          className="input"
          value={acquisitionCostEstimate}
          onChange={(e) => setAcquisitionCostEstimate(e.target.value)}
          placeholder="e.g., $5,000 - $10,000"
        />
      </div>

      <div>
        <label className="label">Data Privacy Concerns</label>
        <textarea
          className="input min-h-[80px]"
          value={dataPrivacyConcerns}
          onChange={(e) => setDataPrivacyConcerns(e.target.value)}
          placeholder="e.g., Contains PII requiring anonymization, GDPR right-to-deletion applies, data sharing agreement needed with partner, HIPAA compliance required for health data"
        />
      </div>

      <ScoreSlider
        label="Data Readiness Score"
        value={dataReadinessScore}
        onChange={setDataReadinessScore}
        min={1}
        max={10}
        levels={[
          { range: '1-3', label: 'Low', description: 'No labeled data; major gaps; would need months of collection before starting (e.g., new domain with no existing datasets)' },
          { range: '4-6', label: 'Medium', description: 'Some data available but needs significant cleaning, labeling, or augmentation (e.g., 5K samples but need 50K)' },
          { range: '7-10', label: 'High', description: 'Sufficient clean, labeled data ready to use; minor gaps easily filled (e.g., 100K labeled images with good coverage)' },
        ]}
      />

      <div className="pt-4">
        <button type="button" className="btn-primary" onClick={handleSave}>
          Save Phase Data
        </button>
      </div>
    </div>
  );
}
