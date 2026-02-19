import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import { useFeatureStore } from '../stores/featureStore';
import { FeatureStatusBadge } from '../components/common/StatusBadge';
import CommentThread from '../components/common/CommentThread';
import BusinessRequirements from '../components/phases/BusinessRequirements';
import RiskReward from '../components/phases/RiskReward';
import MLNecessityCheck from '../components/phases/MLNecessityCheck';
import DataAvailability from '../components/phases/DataAvailability';
import DataLabelingPlan from '../components/phases/DataLabelingPlan';
import ModelSelection from '../components/phases/ModelSelection';
import EvaluationStrategy from '../components/phases/EvaluationStrategy';
import EffortEstimation from '../components/phases/EffortEstimation';
import FinalPrioritization from '../components/phases/FinalPrioritization';
import type { PhaseData } from '../types';

const PHASE_NAMES: Record<number, string> = {
  1: 'Business Requirements',
  2: 'Risk vs Reward',
  3: 'ML Necessity Check',
  4: 'Data Availability',
  5: 'Data Labeling Plan',
  6: 'Model Selection',
  7: 'Evaluation Strategy',
  8: 'Effort Estimation',
  9: 'Final Prioritization',
};

function getPhaseStatus(phases: PhaseData[] | undefined, phaseNumber: number): PhaseData['status'] {
  const phase = phases?.find((p) => p.phaseNumber === phaseNumber);
  return phase?.status ?? 'not_started';
}

function getPhaseData(phases: PhaseData[] | undefined, phaseNumber: number): Record<string, unknown> {
  const phase = phases?.find((p) => p.phaseNumber === phaseNumber);
  return (phase?.data as Record<string, unknown>) ?? {};
}

export default function FeaturePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    currentFeature,
    comments,
    loading,
    fetchFeature,
    updateFeature,
    deleteFeature,
    updatePhase,
    recalculateScore,
    fetchComments,
    addComment,
  } = useFeatureStore();

  const [activePhase, setActivePhase] = useState(1);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedData, setLastSavedData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (id) {
      fetchFeature(id);
      fetchComments(id);
    }
  }, [id, fetchFeature, fetchComments]);

  useEffect(() => {
    if (currentFeature) {
      setActivePhase(currentFeature.currentPhase || 1);
      setEditTitle(currentFeature.title);
      setEditDescription(currentFeature.description);
    }
  }, [currentFeature]);

  useEffect(() => {
    setLastSavedData(null);
  }, [activePhase]);

  // Phase component calls this when user clicks "Save Phase Data"
  const handlePhaseSave = useCallback(async (data: Record<string, unknown>) => {
    if (!id) return;
    setLastSavedData(data);
    setSaving(true);
    try {
      await updatePhase(id, activePhase, data, 'in_progress');
    } finally {
      setSaving(false);
    }
  }, [id, activePhase, updatePhase]);

  const handleCompletePhase = async () => {
    if (!currentFeature || !id) return;
    const data = lastSavedData || getPhaseData(currentFeature.phases, activePhase);
    setSaving(true);
    try {
      await updatePhase(id, activePhase, data, 'completed');
      if (activePhase < 9) {
        setActivePhase(activePhase + 1);
      } else {
        await recalculateScore(id);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!id) return;
    await updateFeature(id, { title: editTitle, description: editDescription });
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    if (currentFeature) {
      setEditTitle(currentFeature.title);
      setEditDescription(currentFeature.description);
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!id) return;
    await deleteFeature(id);
    navigate('/board');
  };

  const handleAddComment = (content: string) => {
    if (id) addComment(id, content, activePhase);
  };

  if (loading && !currentFeature) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!currentFeature) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Feature not found.</p>
      </div>
    );
  }

  const phaseData = getPhaseData(currentFeature.phases, activePhase);
  const phaseComments = comments.filter((c) => c.phaseNumber === activePhase);

  const renderPhaseComponent = () => {
    const props = { data: phaseData, onSave: handlePhaseSave };
    switch (activePhase) {
      case 1: return <BusinessRequirements {...props} />;
      case 2: return <RiskReward {...props} />;
      case 3: return <MLNecessityCheck {...props} />;
      case 4: return <DataAvailability {...props} />;
      case 5: return <DataLabelingPlan {...props} />;
      case 6: return <ModelSelection {...props} />;
      case 7: return <EvaluationStrategy {...props} />;
      case 8: return <EffortEstimation {...props} />;
      case 9: return <FinalPrioritization {...props} />;
      default: return null;
    }
  };

  return (
    <div className="flex flex-col">
      <Header title={currentFeature.title} />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Feature Metadata */}
        <div className="card">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {isEditing ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="input text-lg font-semibold w-full"
                    placeholder="Feature title"
                  />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="input w-full min-h-[80px]"
                    placeholder="Feature description"
                    rows={3}
                  />
                  <div className="flex items-center gap-2">
                    <button onClick={handleSaveEdit} className="btn-primary text-sm">Save</button>
                    <button onClick={handleCancelEdit} className="btn-secondary text-sm">Cancel</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-xl font-semibold text-gray-900">{currentFeature.title}</h2>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Edit
                    </button>
                  </div>
                  {currentFeature.description && (
                    <p className="text-sm text-gray-600 mb-3">{currentFeature.description}</p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 mt-3">
                <FeatureStatusBadge status={currentFeature.status} />
                <span className="text-sm text-gray-500">Phase {currentFeature.currentPhase}/9</span>
                {currentFeature.priorityScore != null && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700">
                    Score: {currentFeature.priorityScore}
                  </span>
                )}
                {currentFeature.assigneeName && (
                  <span className="text-sm text-gray-500">Assignee: {currentFeature.assigneeName}</span>
                )}
                <span className="text-sm text-gray-400">
                  Created {new Date(currentFeature.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div className="ml-4 flex-shrink-0">
              {showDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-600 font-medium">Delete?</span>
                  <button onClick={handleDelete} className="btn-danger text-sm">Confirm</button>
                  <button onClick={() => setShowDeleteConfirm(false)} className="btn-secondary text-sm">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setShowDeleteConfirm(true)} className="btn-danger text-sm">Delete</button>
              )}
            </div>
          </div>
        </div>

        {/* Phase Tabs */}
        <div className="card overflow-hidden p-0">
          <div className="border-b border-gray-200 overflow-x-auto">
            <nav className="flex -mb-px" aria-label="Phase tabs">
              {Array.from({ length: 9 }, (_, i) => i + 1).map((phaseNum) => {
                const status = getPhaseStatus(currentFeature.phases, phaseNum);
                const isActive = activePhase === phaseNum;

                return (
                  <button
                    key={phaseNum}
                    onClick={() => setActivePhase(phaseNum)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                      isActive
                        ? 'border-primary-500 text-primary-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {status === 'completed' && (
                      <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {status === 'in_progress' && (
                      <div className="w-4 h-4 flex-shrink-0">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent" />
                      </div>
                    )}
                    {(status === 'not_started' || status === 'skipped') && (
                      <div className="w-4 h-4 rounded-full bg-gray-200 flex-shrink-0" />
                    )}
                    <span>{phaseNum}. {PHASE_NAMES[phaseNum]}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Phase {activePhase}: {PHASE_NAMES[activePhase]}
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Status:{' '}
                  <span className={`font-medium ${
                    getPhaseStatus(currentFeature.phases, activePhase) === 'completed'
                      ? 'text-green-600'
                      : getPhaseStatus(currentFeature.phases, activePhase) === 'in_progress'
                        ? 'text-blue-600'
                        : 'text-gray-500'
                  }`}>
                    {getPhaseStatus(currentFeature.phases, activePhase).replace(/_/g, ' ')}
                  </span>
                </p>
              </div>
              <button
                onClick={handleCompletePhase}
                disabled={saving || getPhaseStatus(currentFeature.phases, activePhase) === 'completed'}
                className="btn-primary text-sm"
              >
                {saving ? 'Saving...' : activePhase < 9 ? 'Complete & Next Phase' : 'Finalize Feature'}
              </button>
            </div>

            {renderPhaseComponent()}
          </div>
        </div>

        {/* Comments Section */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Phase {activePhase} Comments</h3>
          <CommentThread comments={phaseComments} onAdd={handleAddComment} />
        </div>
      </div>
    </div>
  );
}
