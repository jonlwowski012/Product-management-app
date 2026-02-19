import { useState, KeyboardEvent } from 'react';
import ScoreSlider from '../common/ScoreSlider';

interface EffortEstimationProps {
  data: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => void;
}

export default function EffortEstimation({ data, onSave }: EffortEstimationProps) {
  const [estimatedDevWeeks, setEstimatedDevWeeks] = useState<number>(
    (data.estimated_dev_weeks as number) || 0
  );
  const [teamSizeNeeded, setTeamSizeNeeded] = useState<number>(
    (data.team_size_needed as number) || 1
  );
  const [requiredSkills, setRequiredSkills] = useState<string[]>(
    (data.required_skills as string[]) || []
  );
  const [skillsInput, setSkillsInput] = useState('');
  const [infrastructureCost, setInfrastructureCost] = useState<string>(
    (data.infrastructure_cost as string) || ''
  );
  const [likelihoodOfSuccess, setLikelihoodOfSuccess] = useState<number>(
    (data.likelihood_of_success as number) || 5
  );
  const [confidenceLevel, setConfidenceLevel] = useState<string>(
    (data.confidence_level as string) || 'medium'
  );
  const [keyUncertainties, setKeyUncertainties] = useState<string[]>(
    (data.key_uncertainties as string[]) || []
  );
  const [uncertaintiesInput, setUncertaintiesInput] = useState('');
  const [blockingDependencies, setBlockingDependencies] = useState<string[]>(
    (data.blocking_dependencies as string[]) || []
  );
  const [dependenciesInput, setDependenciesInput] = useState('');

  const handleAddTag = (
    e: KeyboardEvent<HTMLInputElement>,
    input: string,
    setInput: (val: string) => void,
    tags: string[],
    setTags: (tags: string[]) => void
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = input.trim();
      if (value && !tags.includes(value)) {
        setTags([...tags, value]);
      }
      setInput('');
    }
  };

  const handleRemoveTag = (
    tag: string,
    tags: string[],
    setTags: (tags: string[]) => void
  ) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleSave = () => {
    onSave({
      estimated_dev_weeks: estimatedDevWeeks,
      team_size_needed: teamSizeNeeded,
      required_skills: requiredSkills,
      infrastructure_cost: infrastructureCost,
      likelihood_of_success: likelihoodOfSuccess,
      confidence_level: confidenceLevel,
      key_uncertainties: keyUncertainties,
      blocking_dependencies: blockingDependencies,
    });
  };

  const renderTagsInput = (
    label: string,
    tags: string[],
    setTags: (tags: string[]) => void,
    input: string,
    setInput: (val: string) => void,
    placeholder: string,
    chipColor: string = 'bg-primary-100 text-primary-800'
  ) => (
    <div>
      <label className="label">{label}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className={`inline-flex items-center gap-1 px-3 py-1 text-sm rounded-full ${chipColor}`}
          >
            {tag}
            <button
              type="button"
              onClick={() => handleRemoveTag(tag, tags, setTags)}
              className="ml-1 font-bold hover:opacity-70"
            >
              &times;
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        className="input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => handleAddTag(e, input, setInput, tags, setTags)}
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <label className="label">Estimated Development Weeks</label>
        <input
          type="number"
          className="input"
          value={estimatedDevWeeks}
          onChange={(e) => setEstimatedDevWeeks(parseInt(e.target.value) || 0)}
          placeholder="e.g., 2-4 (quick POC), 8-12 (standard model), 16-24 (complex system with pipeline)"
          min={0}
        />
      </div>

      <div>
        <label className="label">Team Size Needed</label>
        <input
          type="number"
          className="input"
          value={teamSizeNeeded}
          onChange={(e) => setTeamSizeNeeded(parseInt(e.target.value) || 1)}
          placeholder="e.g., 1 (solo POC), 2-3 (model + engineer), 5+ (full ML team with MLOps)"
          min={1}
        />
      </div>

      {renderTagsInput(
        'Required Skills',
        requiredSkills,
        setRequiredSkills,
        skillsInput,
        setSkillsInput,
        'e.g., PyTorch, Computer Vision, MLOps, Data Engineering, NLP (press Enter to add)',
        'bg-blue-100 text-blue-800'
      )}

      <div>
        <label className="label">Infrastructure Cost</label>
        <input
          type="text"
          className="input"
          value={infrastructureCost}
          onChange={(e) => setInfrastructureCost(e.target.value)}
          placeholder="e.g., $500/mo (CPU inference), $2K-5K/mo (GPU training), $10K+/mo (multi-GPU cluster + storage)"
        />
      </div>

      <ScoreSlider
        label="Likelihood of Success"
        value={likelihoodOfSuccess}
        onChange={setLikelihoodOfSuccess}
        min={1}
        max={10}
        levels={[
          { range: '1-3', label: 'Low', description: 'Novel research problem; no proven approach exists; high technical uncertainty (e.g., first-of-kind model)' },
          { range: '4-6', label: 'Medium', description: 'Proven approach on similar problems; some adaptation needed; team has partial experience (e.g., transfer learning to new domain)' },
          { range: '7-10', label: 'High', description: 'Well-established technique; team has done this before; clear path to success (e.g., fine-tuning pretrained model on clean data)' },
        ]}
      />

      <div>
        <label className="label">Confidence Level</label>
        <select
          className="input"
          value={confidenceLevel}
          onChange={(e) => setConfidenceLevel(e.target.value)}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <div className="mt-2 space-y-1 text-xs text-gray-500">
          <div><span className="font-medium text-gray-600">Low:</span> First attempt at this type of project; many unknowns in data, model, and infrastructure; estimates could be off by 2-3x</div>
          <div><span className="font-medium text-gray-600">Medium:</span> Team has done similar work; reasonable estimates based on past experience; estimates could be off by 50%</div>
          <div><span className="font-medium text-gray-600">High:</span> Very similar project completed before; well-understood scope and risks; estimates likely within 20%</div>
        </div>
      </div>

      {renderTagsInput(
        'Key Uncertainties',
        keyUncertainties,
        setKeyUncertainties,
        uncertaintiesInput,
        setUncertaintiesInput,
        'e.g., Data quality unknown, Model may not generalize, GPU availability, Regulatory approval timeline (press Enter)',
        'bg-yellow-100 text-yellow-800'
      )}

      {renderTagsInput(
        'Blocking Dependencies',
        blockingDependencies,
        setBlockingDependencies,
        dependenciesInput,
        setDependenciesInput,
        'e.g., Data pipeline from Team X, API access approval, GPU cluster provisioning, Legal review (press Enter)',
        'bg-red-100 text-red-800'
      )}

      <div className="pt-4">
        <button type="button" className="btn-primary" onClick={handleSave}>
          Save Phase Data
        </button>
      </div>
    </div>
  );
}
