import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useFeatureStore } from '../stores/featureStore';
import { useAuthStore } from '../stores/authStore';
import { useProjectStore } from '../stores/projectStore';
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
import {
  PHASE_NAMES,
  FEATURE_TYPES,
  PRIORITIES,
  STATUSES,
} from '../types';
import type { PhaseData } from '../types';

function getPhaseStatus(phases: PhaseData[] | undefined, phaseNumber: number): PhaseData['status'] {
  return phases?.find((p) => p.phaseNumber === phaseNumber)?.status ?? 'not_started';
}

function getPhaseData(phases: PhaseData[] | undefined, phaseNumber: number): Record<string, unknown> {
  return (phases?.find((p) => p.phaseNumber === phaseNumber)?.data as Record<string, unknown>) ?? {};
}

export default function FeaturePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    currentFeature, comments, loading,
    fetchFeature, updateFeature, deleteFeature,
    updatePhase, recalculateScore, fetchComments, addComment,
  } = useFeatureStore();
  const { users } = useAuthStore();
  const { currentProject } = useProjectStore();

  const [activePhase, setActivePhase] = useState(1);
  const [saving, setSaving] = useState(false);
  const [lastSavedData, setLastSavedData] = useState<Record<string, unknown> | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Inline editing states
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');

  useEffect(() => {
    if (id) { fetchFeature(id); fetchComments(id); }
  }, [id, fetchFeature, fetchComments]);

  useEffect(() => {
    if (currentFeature) {
      setActivePhase(currentFeature.currentPhase || 1);
      setTitleDraft(currentFeature.title);
      setDescDraft(currentFeature.description);
    }
  }, [currentFeature]);

  useEffect(() => { setLastSavedData(null); }, [activePhase]);

  const handlePhaseSave = useCallback(async (data: Record<string, unknown>) => {
    if (!id) return;
    setLastSavedData(data);
    setSaving(true);
    try { await updatePhase(id, activePhase, data, 'in_progress'); }
    finally { setSaving(false); }
  }, [id, activePhase, updatePhase]);

  const handleCompletePhase = async () => {
    if (!currentFeature || !id) return;
    const data = lastSavedData || getPhaseData(currentFeature.phases, activePhase);
    setSaving(true);
    try {
      await updatePhase(id, activePhase, data, 'completed');
      if (activePhase < 9) setActivePhase(activePhase + 1);
      else await recalculateScore(id);
    } finally { setSaving(false); }
  };

  const handleFieldUpdate = async (field: string, value: unknown) => {
    if (!id) return;
    await updateFeature(id, { [field]: value } as Record<string, unknown>);
    await fetchFeature(id);
  };

  const handleSaveTitle = async () => {
    if (!id || !titleDraft.trim()) return;
    await updateFeature(id, { title: titleDraft.trim() });
    setEditingTitle(false);
  };

  const handleSaveDesc = async () => {
    if (!id) return;
    await updateFeature(id, { description: descDraft });
    setEditingDesc(false);
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

  const curPhaseData = getPhaseData(currentFeature.phases, activePhase);
  const phaseComments = comments.filter((c) => c.phaseNumber === activePhase);
  const allComments = comments.filter((c) => !c.phaseNumber);
  const priorityInfo = PRIORITIES.find((p) => p.value === currentFeature.priority);

  const renderPhaseComponent = () => {
    const props = { data: curPhaseData, onSave: handlePhaseSave };
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
    <div className="flex flex-col h-screen">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link to="/board" className="hover:text-primary-600">Pipeline Board</Link>
          <span>/</span>
          {currentProject && <span>{currentProject.name}</span>}
          <span>/</span>
          <span className="text-gray-900 font-medium truncate">{currentFeature.title}</span>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex min-h-full">
          {/* LEFT: Main content */}
          <div className="flex-1 p-6 space-y-6 min-w-0">
            {/* Title - click to edit */}
            <div>
              {editingTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    className="input text-2xl font-bold flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle();
                      if (e.key === 'Escape') { setEditingTitle(false); setTitleDraft(currentFeature.title); }
                    }}
                  />
                  <button onClick={handleSaveTitle} className="btn-primary text-sm">Save</button>
                  <button onClick={() => { setEditingTitle(false); setTitleDraft(currentFeature.title); }} className="btn-secondary text-sm">Cancel</button>
                </div>
              ) : (
                <h1
                  onClick={() => setEditingTitle(true)}
                  className="text-2xl font-bold text-gray-900 cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1 py-0.5"
                  title="Click to edit"
                >
                  {currentFeature.title}
                </h1>
              )}
            </div>

            {/* Description - click to edit */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Description</h3>
              {editingDesc ? (
                <div className="space-y-2">
                  <textarea
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                    className="input w-full min-h-[120px]"
                    autoFocus
                    placeholder="Add a description..."
                    rows={5}
                  />
                  <div className="flex gap-2">
                    <button onClick={handleSaveDesc} className="btn-primary text-sm">Save</button>
                    <button onClick={() => { setEditingDesc(false); setDescDraft(currentFeature.description); }} className="btn-secondary text-sm">Cancel</button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => setEditingDesc(true)}
                  className="cursor-pointer hover:bg-gray-50 rounded p-2 -mx-2 min-h-[48px] text-sm text-gray-700 whitespace-pre-wrap"
                  title="Click to edit"
                >
                  {currentFeature.description || <span className="text-gray-400 italic">Click to add a description...</span>}
                </div>
              )}
            </div>

            {/* Phase Tabs */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="border-b border-gray-200 overflow-x-auto">
                <nav className="flex -mb-px">
                  {Array.from({ length: 9 }, (_, i) => i + 1).map((phaseNum) => {
                    const status = getPhaseStatus(currentFeature.phases, phaseNum);
                    const isActive = activePhase === phaseNum;
                    return (
                      <button
                        key={phaseNum}
                        onClick={() => setActivePhase(phaseNum)}
                        className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
                          isActive
                            ? 'border-primary-500 text-primary-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        {status === 'completed' ? (
                          <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : status === 'in_progress' ? (
                          <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full bg-gray-200" />
                        )}
                        <span>{phaseNum}. {PHASE_NAMES[phaseNum]}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              <div className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">
                      Phase {activePhase}: {PHASE_NAMES[activePhase]}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {getPhaseStatus(currentFeature.phases, activePhase).replace(/_/g, ' ')}
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

            {/* Phase Comments */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Phase {activePhase} Comments</h3>
              <CommentThread comments={phaseComments} onAdd={handleAddComment} />
            </div>

            {/* General Activity */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Activity</h3>
              <CommentThread
                comments={allComments}
                onAdd={(content) => { if (id) addComment(id, content); }}
              />
            </div>
          </div>

          {/* RIGHT: Detail sidebar */}
          <div className="w-80 border-l border-gray-200 bg-gray-50 p-5 space-y-5 flex-shrink-0">
            {/* Status */}
            <SidebarField label="Status">
              <select
                value={currentFeature.status}
                onChange={(e) => handleFieldUpdate('status', e.target.value)}
                className="sidebar-select"
              >
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </SidebarField>

            {/* Type */}
            <SidebarField label="Type">
              <select
                value={currentFeature.featureType || 'model'}
                onChange={(e) => handleFieldUpdate('featureType', e.target.value)}
                className="sidebar-select"
              >
                {FEATURE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </SidebarField>

            {/* Priority */}
            <SidebarField label="Priority">
              <select
                value={currentFeature.priority || 'medium'}
                onChange={(e) => handleFieldUpdate('priority', e.target.value)}
                className="sidebar-select"
              >
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              {priorityInfo && (
                <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${priorityInfo.color}`}>
                  {priorityInfo.label}
                </span>
              )}
            </SidebarField>

            {/* Assignee */}
            <SidebarField label="Assignee">
              <select
                value={currentFeature.assigneeId || ''}
                onChange={(e) => handleFieldUpdate('assigneeId', e.target.value || null)}
                className="sidebar-select"
              >
                <option value="">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </SidebarField>

            {/* Reporter */}
            <SidebarField label="Reporter">
              <select
                value={currentFeature.reporterId || ''}
                onChange={(e) => handleFieldUpdate('reporterId', e.target.value || null)}
                className="sidebar-select"
              >
                <option value="">None</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </SidebarField>

            {/* Story Points */}
            <SidebarField label="Story Points">
              <InlineNumberField
                value={currentFeature.storyPoints}
                onSave={(v) => handleFieldUpdate('storyPoints', v)}
                placeholder="None"
              />
            </SidebarField>

            {/* Due Date */}
            <SidebarField label="Due Date">
              <input
                type="date"
                value={currentFeature.dueDate || ''}
                onChange={(e) => handleFieldUpdate('dueDate', e.target.value || null)}
                className="sidebar-select"
              />
            </SidebarField>

            {/* Phase Progress */}
            <SidebarField label="Phase Progress">
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-primary-500 h-2 rounded-full transition-all"
                    style={{ width: `${(currentFeature.currentPhase / 9) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-700 tabular-nums">{currentFeature.currentPhase}/9</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">{PHASE_NAMES[currentFeature.currentPhase]}</p>
            </SidebarField>

            {/* Priority Score */}
            <SidebarField label="Priority Score">
              {currentFeature.priorityScore != null ? (
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-purple-700">{currentFeature.priorityScore}</span>
                  <button
                    onClick={() => id && recalculateScore(id)}
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Recalculate
                  </button>
                </div>
              ) : (
                <span className="text-sm text-gray-400 italic">Not yet scored</span>
              )}
            </SidebarField>

            {/* Labels */}
            <SidebarField label="Labels">
              {currentFeature.tags && currentFeature.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {currentFeature.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: tag.color + '20', color: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-gray-400 italic">No labels</span>
              )}
            </SidebarField>

            {/* Metadata footer */}
            <div className="border-t border-gray-200 pt-4 space-y-2 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>Created</span>
                <span>{new Date(currentFeature.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Updated</span>
                <span>{new Date(currentFeature.updatedAt).toLocaleDateString()}</span>
              </div>
              {currentFeature.createdByName && (
                <div className="flex justify-between">
                  <span>Created by</span>
                  <span className="font-medium text-gray-700">{currentFeature.createdByName}</span>
                </div>
              )}
            </div>

            {/* Delete */}
            <div className="border-t border-gray-200 pt-4">
              {showDeleteConfirm ? (
                <div className="space-y-2">
                  <p className="text-xs text-red-600 font-medium">Are you sure? This cannot be undone.</p>
                  <div className="flex gap-2">
                    <button onClick={handleDelete} className="btn-danger text-xs flex-1">Delete</button>
                    <button onClick={() => setShowDeleteConfirm(false)} className="btn-secondary text-xs flex-1">Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full text-xs text-red-600 hover:text-red-700 font-medium py-1.5 hover:bg-red-50 rounded-md transition-colors"
                >
                  Delete feature
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function InlineNumberField({
  value,
  onSave,
  placeholder,
}: {
  value: number | null;
  onSave: (v: number | null) => void;
  placeholder: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() || '');

  const save = () => {
    const num = draft.trim() ? parseInt(draft) : null;
    onSave(isNaN(num as number) ? null : num);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="sidebar-select"
        autoFocus
        min={0}
      />
    );
  }

  return (
    <div
      onClick={() => { setDraft(value?.toString() || ''); setEditing(true); }}
      className="text-sm cursor-pointer hover:bg-white rounded px-2 py-1.5 -mx-2 transition-colors"
    >
      {value != null ? (
        <span className="font-medium text-gray-900">{value}</span>
      ) : (
        <span className="text-gray-400 italic">{placeholder}</span>
      )}
    </div>
  );
}
