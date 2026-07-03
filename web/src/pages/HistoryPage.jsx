import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export function HistoryPage() {
  const navigate = useNavigate();
  const [hands, setHands] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/players/me/history?page=${page}`)
      .then(({ data }) => setHands(data))
      .catch(() => setHands([]))
      .finally(() => setLoading(false));
  }, [page]);

  function winnersOf(h) {
    try {
      const w = typeof h.winners_json === 'string' ? JSON.parse(h.winners_json) : h.winners_json;
      return (w || []).map(x => `${x.nickname || '?'}${x.handName && x.handName !== 'Winner' ? ` (${x.handName})` : ''}`).join(', ');
    } catch { return '—'; }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-white">← Lobby</button>
        <h1 className="text-xl font-bold">📜 Mis manos</h1>
        <div className="w-16" />
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {loading ? (
          <p className="text-center text-gray-500 py-16">Cargando...</p>
        ) : !hands.length ? (
          <p className="text-center text-gray-500 py-16">No hay manos registradas todavía. ¡Juega algunas!</p>
        ) : (
          <div className="space-y-2">
            {hands.map(h => (
              <div
                key={h.id}
                className="flex items-center justify-between bg-gray-900 border border-gray-800 hover:border-green-700 rounded-xl px-4 py-3 cursor-pointer transition-colors"
                onClick={() => navigate(`/replay/${h.id}`)}
              >
                <div>
                  <div className="font-bold text-sm">
                    Mano #{h.hand_number}
                    <span className="ml-2 text-xs font-normal text-gray-500 uppercase">{h.game_type}</span>
                  </div>
                  <div className="text-xs text-gray-400">
                    🏆 {winnersOf(h)} · {new Date(h.ended_at).toLocaleString('es-PE')}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-green-400 font-mono text-sm">Bote {Number(h.pot_total).toLocaleString()}</span>
                  <span className="text-sky-400 text-xs font-bold">▶ Replay</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-center gap-3 mt-6">
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="px-4 py-1.5 bg-gray-800 rounded-lg text-sm disabled:opacity-30"
          >← Anterior</button>
          <span className="text-sm text-gray-500 py-1.5">Página {page}</span>
          <button
            disabled={hands.length < 20}
            onClick={() => setPage(p => p + 1)}
            className="px-4 py-1.5 bg-gray-800 rounded-lg text-sm disabled:opacity-30"
          >Siguiente →</button>
        </div>
      </main>
    </div>
  );
}
