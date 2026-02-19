import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';

export default function LoginPage() {
  const { login, register } = useAuthStore();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isRegister) {
        await register(email, name, password);
      } else {
        await login(email, password);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">AI Feature Planner</h1>
          <p className="text-gray-500 mt-2">
            9-Phase ML Prioritization Pipeline
          </p>
        </div>

        <div className="card">
          <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
            <button
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                !isRegister ? 'bg-white shadow text-gray-900' : 'text-gray-500'
              }`}
              onClick={() => setIsRegister(false)}
            >
              Sign In
            </button>
            <button
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                isRegister ? 'bg-white shadow text-gray-900' : 'text-gray-500'
              }`}
              onClick={() => setIsRegister(true)}
            >
              Register
            </button>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="pm@example.com"
                required
              />
            </div>

            {isRegister && (
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                />
              </div>
            )}

            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
              />
            </div>

            <button type="submit" className="btn-primary w-full">
              {isRegister ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center">
              Demo: pm@example.com / pm123
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
