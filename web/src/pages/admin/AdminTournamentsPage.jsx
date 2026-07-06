import { useEffect, useState } from 'react';
import api from '../../services/api';
import { AdminNav } from './AdminNav';

const LEVELS = [5, 6, 7, 8, 9, 10];
// Ciegas turbo (para pruebas rápidas): suben cada 30s
const TURBO = [
  { smallBlind: 20, bigBlind: 40, minutes: 0.5 },
  { smallBlind: 50, bigBlind: 100, minutes: 0.5 },
  { smallBlind: 150, bigBlind: 300, minutes: 0.5 },
  { smallBlind: 400, bigBlind: 800, minutes: 0.5 },
  { smallBlind: 1000, bigBlind: 2000, minutes: 99 },
];

export function AdminTournamentsPage() {
  const [list, setList] = useState([]);
  const [name, setName] = useState('Torneo de prueba');
  const [maxPlayers, setMaxPlayers] = useState(18);
  const [buyIn, setBuyIn] = useState(100);
  const [turbo, setTurbo] = useState(true);
  const [botLevel, setBotLevel] = useState(7);
  const [botCount, setBotCount] = useState(6);
  const [msg, setMsg] = useState('');

  async function load() {
    try { const { data } = await api.get('/tournaments'); setList(data); } catch {}
  }
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);

  async function create() {
    setMsg('');
    try {
      await api.post('/tournaments', { name, maxPlayers, buyIn, blindSchedule: turbo ? TURBO : null });
      setMsg('✅ Torneo creado');
      load();
    } catch (e) { setMsg('❌ ' + (e.response?.data?.error || 'Error')); }
  }
  async function fill(id) {
    try { const { data } = await api.post(`/tournaments/${id}/bots`, { level: botLevel, count: botCount }); setMsg(`✅ ${data.added} bots agregados${data.started ? ' — ¡torneo iniciado!' : ''}`); load(); }
    catch (e) { setMsg('❌ ' + (e.response?.data?.error || 'Error')); }
  }
  async function start(id) {
    try { await api.post(`/tournaments/${id}/start`); setMsg('✅ Torneo iniciado'); load(); }
    catch (e) { setMsg('❌ ' + (e.response?.data?.error || 'Error')); }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <AdminNav />
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-1">🏆 Torneos Sit&Go</h1>
        <p className="text-sm text-gray-400 mb-6">Crea un campeonato, rellénalo con bots y arranca. Los testers se inscriben desde el lobby.</p>

        {/* Crear */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 space-y-3">
          <h2 className="font-bold text-sm">Crear torneo</h2>
          <div className="flex gap-3">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre"
              className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm" />
            <div className="w-28">
              <label className="text-[10px] text-gray-500 block">Jugadores (2–30)</label>
              <input type="number" min={2} max={30} value={maxPlayers} onChange={e => setMaxPlayers(Number(e.target.value))}
                className="w-full bg-gray-800 rounded-lg px-3 py-1.5 text-sm" />
            </div>
            <div className="w-28">
              <label className="text-[10px] text-gray-500 block">Buy-in</label>
              <input type="number" min={0} value={buyIn} onChange={e => setBuyIn(Number(e.target.value))}
                className="w-full bg-gray-800 rounded-lg px-3 py-1.5 text-sm" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={turbo} onChange={e => setTurbo(e.target.checked)} />
            Modo turbo (ciegas suben cada 30s — ideal para pruebas)
          </label>
          <button onClick={create} className="bg-green-700 hover:bg-green-600 font-bold px-5 py-2 rounded-lg text-sm">Crear torneo</button>
        </div>

        {/* Ajustes de relleno con bots */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-gray-400 uppercase font-bold">Nivel de bots a agregar</label>
            <div className="flex gap-1 mt-1">
              {LEVELS.map(n => (
                <button key={n} onClick={() => setBotLevel(n)}
                  className={`flex-1 py-1.5 rounded text-sm font-bold ${botLevel === n ? 'bg-yellow-600 text-black' : 'bg-gray-800 text-gray-400'}`}>{n}</button>
              ))}
            </div>
          </div>
          <div className="w-20">
            <label className="text-[10px] text-gray-500 block">Cantidad</label>
            <input type="number" min={1} max={30} value={botCount} onChange={e => setBotCount(Number(e.target.value))}
              className="w-full bg-gray-800 rounded-lg px-3 py-1.5 text-sm" />
          </div>
        </div>

        {msg && <p className="text-sm mb-4">{msg}</p>}

        {/* Lista */}
        <h2 className="font-bold mb-2">Torneos abiertos / en curso</h2>
        <div className="space-y-2">
          {list.length === 0 ? <p className="text-sm text-gray-500">Ninguno todavía.</p> : list.map(t => (
            <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm">{t.name}
                    <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full ${t.status === 'running' ? 'bg-green-900 text-green-300' : 'bg-sky-900 text-sky-300'}`}>{t.status}</span>
                  </div>
                  <div className="text-xs text-gray-400">{t.registered}/{t.max_players} inscritos · buy-in {t.buy_in} · bote {t.prize_pool}</div>
                </div>
                {t.status === 'registering' && (
                  <div className="flex gap-2">
                    <button onClick={() => fill(t.id)} className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg">+ Bots nivel {botLevel}</button>
                    <button onClick={() => start(t.id)} className="text-xs bg-green-700 hover:bg-green-600 px-3 py-1.5 rounded-lg font-bold">Iniciar</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
