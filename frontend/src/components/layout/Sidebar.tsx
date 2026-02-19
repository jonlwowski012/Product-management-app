import { NavLink } from 'react-router-dom';
import { useProjectStore } from '../../stores/projectStore';
import { useAuthStore } from '../../stores/authStore';

export default function Sidebar() {
  const { projects, currentProject, setCurrentProject } = useProjectStore();
  const { user, logout } = useAuthStore();

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col h-screen fixed left-0 top-0">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-bold">AI Feature Planner</h1>
        <p className="text-xs text-gray-400 mt-1">ML Prioritization Pipeline</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              isActive ? 'bg-primary-600 text-white' : 'text-gray-300 hover:bg-gray-800'
            }`
          }
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          Dashboard
        </NavLink>

        <NavLink
          to="/board"
          className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              isActive ? 'bg-primary-600 text-white' : 'text-gray-300 hover:bg-gray-800'
            }`
          }
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
          </svg>
          Pipeline Board
        </NavLink>

        <NavLink
          to="/roadmap"
          className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              isActive ? 'bg-primary-600 text-white' : 'text-gray-300 hover:bg-gray-800'
            }`
          }
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Roadmap
        </NavLink>
      </nav>

      {projects.length > 0 && (
        <div className="p-4 border-t border-gray-700">
          <label className="text-xs text-gray-400 block mb-1">Project</label>
          <select
            className="w-full bg-gray-800 text-white text-sm rounded px-2 py-1.5 border border-gray-600"
            value={currentProject?.id || ''}
            onChange={(e) => {
              const p = projects.find((p) => p.id === e.target.value);
              if (p) setCurrentProject(p);
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{user?.name}</p>
            <p className="text-xs text-gray-400">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="text-gray-400 hover:text-white text-xs"
          >
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
