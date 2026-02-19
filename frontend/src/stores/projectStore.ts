import { create } from 'zustand';
import type { Project } from '../types';
import { api } from '../utils/api';

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  loading: boolean;
  fetchProjects: () => Promise<void>;
  setCurrentProject: (project: Project) => void;
  createProject: (name: string, description: string) => Promise<Project>;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  currentProject: null,
  loading: false,

  fetchProjects: async () => {
    set({ loading: true });
    const projects = await api.get<Project[]>('/projects');
    set({ projects, loading: false });
    if (projects.length > 0) {
      set((state) => ({ currentProject: state.currentProject || projects[0] }));
    }
  },

  setCurrentProject: (project) => set({ currentProject: project }),

  createProject: async (name, description) => {
    const project = await api.post<Project>('/projects', { name, description });
    set((state) => ({ projects: [...state.projects, project], currentProject: project }));
    return project;
  },
}));
