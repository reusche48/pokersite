import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '../../services/api';

// Clasificación del torneo tipo PokerStars: en juego (con fichas) + eliminados.
export function TournamentStandings({ tournamentId, myId, compact = false }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setOpen(true);
    setLoading(true);
    try {
      const r = await api.get(`/tournaments/${tournamentId}/standings`);
      setData(r.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={load}
        className="text-purple-200 hover:text-white transition font-semibold"
        title="Ver clasificación del torneo"
      >
        📋 {compact ? '' : 'Clasificación'}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col bg-[#140f1c] border-purple-800/50 text-white">
          <DialogHeader>
            <DialogTitle className="text-yellow-300">
              🏆 {data?.name || 'Clasificación'}
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <p className="text-gray-400 text-sm py-6 text-center">Cargando…</p>
          ) : !data ? (
            <p className="text-gray-400 text-sm py-6 text-center">No disponible</p>
          ) : (
            <div className="overflow-y-auto pr-1">
              {/* En juego */}
              <div className="text-[11px] uppercase tracking-wider text-green-400 font-bold mb-1">
                En juego ({data.alive.length}/{data.total}) · pagan top {data.paidPlaces}
              </div>
              <div className="space-y-0.5 mb-4">
                {data.alive.map((p) => {
                  const inMoney = p.rank <= data.paidPlaces;
                  const isMe = p.playerId === myId;
                  return (
                    <div
                      key={p.playerId}
                      className={`flex items-center justify-between rounded px-2 py-1 text-sm ${
                        isMe ? 'bg-blue-900/60 border border-blue-600' : 'bg-white/5'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className={`w-6 text-right font-mono text-xs ${inMoney ? 'text-yellow-300' : 'text-gray-400'}`}>
                          {inMoney ? '🏅' : ''}{p.rank}
                        </span>
                        <span className={`truncate ${isMe ? 'text-yellow-300 font-bold' : 'text-white'}`}>
                          {p.nickname}{isMe ? ' (tú)' : ''}
                        </span>
                      </span>
                      <span className="font-mono text-green-400 font-bold">{p.stack.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>

              {/* Eliminados */}
              {data.eliminated.length > 0 && (
                <>
                  <div className="text-[11px] uppercase tracking-wider text-red-400 font-bold mb-1">
                    Eliminados ({data.eliminated.length})
                  </div>
                  <div className="space-y-0.5 opacity-70">
                    {data.eliminated.map((p) => (
                      <div key={p.playerId} className="flex items-center justify-between px-2 py-0.5 text-sm">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="w-6 text-right font-mono text-xs text-gray-500">{p.position}º</span>
                          <span className="truncate text-gray-300">{p.nickname}</span>
                        </span>
                        <span className="text-gray-500 text-xs">💀</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
