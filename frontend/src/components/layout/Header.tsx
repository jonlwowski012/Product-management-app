import { useProjectStore } from '../../stores/projectStore';

export default function Header({ title }: { title: string }) {
  const { currentProject } = useProjectStore();

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          {currentProject && (
            <p className="text-sm text-gray-500">{currentProject.name}</p>
          )}
        </div>
      </div>
    </header>
  );
}
