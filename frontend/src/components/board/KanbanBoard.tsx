import { useEffect, useMemo, useState } from 'react';
import { PHASE_NAMES } from '../../types';
import { useFeatureStore } from '../../stores/featureStore';
import { useProjectStore } from '../../stores/projectStore';
import PhaseColumn from './PhaseColumn';

export default function KanbanBoard() {
  const { features, loading, fetchFeatures, createFeature } = useFeatureStore();
  const { currentProject } = useProjectStore();

  const [search, setSearch] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (currentProject) {
      fetchFeatures(currentProject.id);
    }
  }, [currentProject, fetchFeatures]);

  const filteredFeatures = useMemo(() => {
    if (!search.trim()) return features;
    const query = search.toLowerCase();
    return features.filter((f) => f.title.toLowerCase().includes(query));
  }, [features, search]);

  const featuresByPhase = useMemo(() => {
    const grouped: Record<number, typeof filteredFeatures> = {};
    for (let phase = 1; phase <= 9; phase++) {
      grouped[phase] = [];
    }
    for (const feature of filteredFeatures) {
      const phase = feature.currentPhase;
      if (phase >= 1 && phase <= 9) {
        grouped[phase].push(feature);
      }
    }
    return grouped;
  }, [filteredFeatures]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProject || !newTitle.trim()) return;
    setCreating(true);
    try {
      await createFeature(currentProject.id, newTitle.trim(), newDescription.trim());
      setNewTitle('');
      setNewDescription('');
      setShowCreateForm(false);
    } finally {
      setCreating(false);
    }
  };

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Select a project to view the pipeline board.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pipeline Board</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {currentProject.name} &mdash; {features.length} feature{features.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search features..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent w-56"
            />
          </div>

          <button
            onClick={() => setShowCreateForm((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Feature
          </button>
        </div>
      </div>

      {/* Quick Create Form */}
      {showCreateForm && (
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-200">
          <form onSubmit={handleCreate} className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                required
                placeholder="Feature title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                autoFocus
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                placeholder="Brief description (optional)"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={creating || !newTitle.trim()}
              className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setNewTitle('');
                setNewDescription('');
              }}
              className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* Board */}
      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <div className="flex items-center gap-2 text-gray-500">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-sm">Loading features...</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto p-4">
          <div className="flex gap-4 h-full min-w-max">
            {Object.entries(PHASE_NAMES).map(([phaseStr, phaseName]) => {
              const phaseNumber = Number(phaseStr);
              return (
                <PhaseColumn
                  key={phaseNumber}
                  phaseNumber={phaseNumber}
                  phaseName={phaseName}
                  features={featuresByPhase[phaseNumber] || []}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
