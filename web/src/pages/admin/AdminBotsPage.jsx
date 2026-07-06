import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { AdminNav } from './AdminNav';

const LEVELS = [5, 6, 7, 8, 9, 10];

export function AdminBotsPage() {
  const navigate = useNavigate();
  const [tables, setTables] = useState([]);
  const [tableId, setTableId] = useState('');
  const [level, setLevel] = useState(7);
  const [count, setCount] = useState(3);
  const [active, setActive] = useState([]);
  const [msg, setMsg] = useState('');

  async function loadTables() {
    try { const { data } = await api.get('/tables'); setTables(data); if (!tableId && data[0]) setTableId(data[0].id); } catch {}
  }
  async function loadActive() {
    try { const { data } = await api.get('/admin/bots'); setActive(data); } catch {}
  }
  useEffect(() => { loadTables(); loadActive(); const t = setInterval(loadActive, 4000); return () => clearInterval(t); }, []);

  async function seat() {
    setMsg('');
    try {
      const { data } = await api.post('/admin/bots/seat', { tableId, level, count });
      setMsg(`✅ ${data.seated} bots nivel ${level} sentados`);
      loadActive();
    } catch (e) { setMsg('❌ ' + (e.response?.data?.error || 'Error')); }
  }
  async function unseatTable() {
    try { await api.post('/admin/bots/unseat', { tableId }); loadActive(); } catch {}
  }

  const atTable = active.filter(b => b.tableId === tableId);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <AdminNav />
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-1">🤖 Sentar bots</h1>
        <p className="text-sm text-gray-400 mb-6">Elige una mesa y llénala con bots del nivel que quieras. Los testers no verán el nivel.</p>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-5 space-y-4">
          <div>
            <label className="text-xs text-gray-400 uppercase font-bold">Mesa</label>
            <select value={tableId} onChange={e => setTableId(e.target.value)}
              className="w-full mt-1 bg-gray-800 rounded-lg px-3 py-2 text-sm">
              {tables.map(t => <option key={t.id} value={t.id}>{t.name} ({t.seated}/{t.maxSeats || t.max_seats})</option>)}
            </select>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs text-gray-400 uppercase font-bold">Nivel</label>
              <div className="flex gap-1 mt-1">
                {LEVELS.map(n => (
                  <button key={n} onClick={() => setLevel(n)}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold ${level === n ? 'bg-yellow-600 text-black' : 'bg-gray-800 text-gray-400'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-24">
              <label className="text-xs text-gray-400 uppercase font-bold">Cantidad</label>
              <input type="number" min={1} max={8} value={count} onChange={e => setCount(Number(e.target.value))}
                className="w-full mt-1 bg-gray-800 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={seat} className="flex-1 bg-green-700 hover:bg-green-600 font-bold py-2 rounded-lg">Sentar bots</button>
            <button onClick={unseatTable} className="bg-red-900 hover:bg-red-800 px-4 py-2 rounded-lg text-sm">Retirar todos de esta mesa</button>
          </div>
          {msg && <p className="text-sm">{msg}</p>}
        </div>

        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold">Bots activos en esta mesa ({atTable.length})</h2>
          <button onClick={() => navigate(`/table/${tableId}?buyIn=300`)} className="text-xs text-sky-400 hover:text-sky-300">Abrir la mesa →</button>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
          {atTable.length === 0 ? (
            <p className="text-sm text-gray-500 p-4 text-center">Sin bots en esta mesa.</p>
          ) : atTable.map(b => (
            <div key={b.botId} className="flex items-center justify-between px-4 py-2 text-sm">
              <span>{b.nickname}</span>
              <span className="text-xs bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded-full font-bold">Nivel {b.level}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
