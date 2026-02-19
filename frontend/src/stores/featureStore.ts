import { create } from 'zustand';
import type { Feature, PhaseData, Comment } from '../types';
import { api } from '../utils/api';

interface FeatureState {
  features: Feature[];
  currentFeature: Feature | null;
  comments: Comment[];
  loading: boolean;
  fetchFeatures: (projectId: string) => Promise<void>;
  fetchFeature: (id: string) => Promise<void>;
  createFeature: (projectId: string, title: string, description: string) => Promise<Feature>;
  updateFeature: (id: string, data: Partial<Feature>) => Promise<void>;
  deleteFeature: (id: string) => Promise<void>;
  updatePhase: (featureId: string, phaseNumber: number, data: Record<string, unknown>, status?: string) => Promise<PhaseData>;
  recalculateScore: (featureId: string) => Promise<number | null>;
  fetchComments: (featureId: string) => Promise<void>;
  addComment: (featureId: string, content: string, phaseNumber?: number) => Promise<void>;
}

export const useFeatureStore = create<FeatureState>((set, get) => ({
  features: [],
  currentFeature: null,
  comments: [],
  loading: false,

  fetchFeatures: async (projectId) => {
    set({ loading: true });
    const features = await api.get<Feature[]>(`/features/project/${projectId}`);
    set({ features, loading: false });
  },

  fetchFeature: async (id) => {
    set({ loading: true });
    const feature = await api.get<Feature>(`/features/${id}`);
    set({ currentFeature: feature, loading: false });
  },

  createFeature: async (projectId, title, description) => {
    const feature = await api.post<Feature>('/features', { projectId, title, description });
    set((state) => ({ features: [...state.features, feature] }));
    return feature;
  },

  updateFeature: async (id, data) => {
    const updated = await api.put<Feature>(`/features/${id}`, data);
    set((state) => ({
      features: state.features.map((f) => (f.id === id ? { ...f, ...updated } : f)),
      currentFeature: state.currentFeature?.id === id ? { ...state.currentFeature, ...updated } : state.currentFeature,
    }));
  },

  deleteFeature: async (id) => {
    await api.delete(`/features/${id}`);
    set((state) => ({
      features: state.features.filter((f) => f.id !== id),
      currentFeature: state.currentFeature?.id === id ? null : state.currentFeature,
    }));
  },

  updatePhase: async (featureId, phaseNumber, data, status) => {
    const phase = await api.put<PhaseData>(`/phases/feature/${featureId}/${phaseNumber}`, { data, status });
    // Refresh feature to get updated phases
    await get().fetchFeature(featureId);
    return phase;
  },

  recalculateScore: async (featureId) => {
    const result = await api.post<{ priorityScore: number | null }>(`/features/${featureId}/score`);
    await get().fetchFeature(featureId);
    return result.priorityScore;
  },

  fetchComments: async (featureId) => {
    const comments = await api.get<Comment[]>(`/comments/feature/${featureId}`);
    set({ comments });
  },

  addComment: async (featureId, content, phaseNumber) => {
    const comment = await api.post<Comment>('/comments', { featureId, content, phaseNumber });
    set((state) => ({ comments: [...state.comments, comment] }));
  },
}));
