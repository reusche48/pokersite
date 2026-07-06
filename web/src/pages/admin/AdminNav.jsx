import { useNavigate, useLocation } from 'react-router-dom';

const TABS = [
  { path: '/admin/bots', label: '🤖 Bots' },
  { path: '/admin/torneos', label: '🏆 Torneos' },
  { path: '/admin/precision', label: '🎯 Precisión testers' },
];

export function AdminNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <header className="border-b border-gray-800 bg-black/40">
      <div className="max-w-3xl mx-auto px-4 flex items-center gap-1">
        <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-white py-3 pr-4">← Lobby</button>
        {TABS.map(t => (
          <button key={t.path} onClick={() => navigate(t.path)}
            className={`text-sm py-3 px-3 border-b-2 -mb-px ${pathname === t.path ? 'border-yellow-500 text-yellow-400 font-bold' : 'border-transparent text-gray-400 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>
    </header>
  );
}
