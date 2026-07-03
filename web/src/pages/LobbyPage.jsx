import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

function NicknameModal({ onClose }) {
  const [nick, setNick] = useState('');
  const [mode, setMode] = useState('guest'); // 'guest' | 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const { guestLogin, login, register } = useAuth();

  async function submit(e) {
    e.preventDefault();
    setErr('');
    try {
      if (mode === 'guest') await guestLogin(nick);
      else if (mode === 'login') await login(email, password);
      else await register(nick, email, password);
      onClose();
    } catch (e) {
      setErr(e.response?.data?.error || 'Error');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-sm border border-gray-700 shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">♠ PokerSite</h2>
        <div className="flex gap-2 mb-4">
          {['guest','login','register'].map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 text-xs py-2 rounded-lg font-semibold transition-colors ${mode === m ? 'bg-green-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              {m === 'guest' ? 'Invitado' : m === 'login' ? 'Iniciar sesión' : 'Registrarse'}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-3">
          {mode !== 'login' && (
            <input value={nick} onChange={e => setNick(e.target.value)} placeholder="Nickname" required minLength={2} maxLength={32}
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500" />
          )}
          {mode !== 'guest' && <>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500" />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Contraseña" required minLength={6}
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500" />
          </>}
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button type="submit" className="w-full bg-green-700 hover:bg-green-600 text-white font-bold py-3 rounded-xl transition-colors">
            {mode === 'guest' ? 'Entrar como invitado' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </form>
      </div>
    </div>
  );
}

function TableCard({ table, onJoin }) {
  const seated = table.seated || 0;
  const full = seated >= table.max_seats;
  return (
    <div className="bg-gray-800 rounded-2xl p-5 border border-gray-700 hover:border-green-600 transition-colors">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-bold text-white text-lg">{table.name}</h3>
          <span className="text-xs text-gray-400 uppercase tracking-wider">{table.game_type?.replace('_',' ')} · {table.chip_mode === 'real' ? '💵 Real' : '🎮 Play'}</span>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-semibold ${full ? 'bg-red-900 text-red-300' : 'bg-green-900 text-green-300'}`}>
          {seated}/{table.max_seats}
        </span>
      </div>
      <div className="text-sm text-gray-300 mb-4">
        Ciegas: <span className="text-white font-mono">${table.small_blind}/${table.big_blind}</span>
        <span className="mx-2">·</span>
        Buy-in: <span className="text-white font-mono">${table.buy_in_min}–${table.buy_in_max}</span>
      </div>
      <button
        onClick={() => onJoin(table)}
        disabled={full}
        className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white font-bold py-2 rounded-xl transition-colors"
      >
        {full ? 'Mesa llena' : 'Unirse'}
      </button>
    </div>
  );
}

export function LobbyPage() {
  const { player, logout } = useAuth();
  const navigate = useNavigate();
  const { connect } = useSocket();
  const [tables, setTables] = useState([]);
  const [showAuth, setShowAuth] = useState(false);
  const [buyInModal, setBuyInModal] = useState(null);
  const [buyIn, setBuyIn] = useState('');

  useEffect(() => {
    if (!player) { setShowAuth(true); return; }
    connect();
    fetchTables();
    const t = setInterval(fetchTables, 10000);
    return () => clearInterval(t);
  }, [player]);

  async function fetchTables() {
    try {
      const { data } = await api.get('/tables');
      setTables(data);
    } catch {}
  }

  function handleJoin(table) {
    if (!player) return setShowAuth(true);
    setBuyInModal(table);
    setBuyIn(String(table.buy_in_min));
  }

  async function confirmJoin() {
    navigate(`/table/${buyInModal.id}?buyIn=${buyIn}`);
    setBuyInModal(null);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {showAuth && <NicknameModal onClose={() => setShowAuth(false)} />}

      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <h1 className="text-2xl font-bold text-green-400">♠ PokerSite</h1>
        {player && (
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/historial')} className="text-xs text-sky-400 hover:text-sky-300 font-bold">📜 Mis manos</button>
            <span className="text-sm text-gray-300">{player.nickname}</span>
            <span className="text-sm text-green-400 font-mono">🎮 ${player.play_chips?.toLocaleString()}</span>
            <button onClick={logout} className="text-xs text-gray-500 hover:text-gray-300">Salir</button>
          </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <h2 className="text-xl font-bold mb-6">Mesas disponibles</h2>
        {tables.length === 0 ? (
          <div className="text-center text-gray-500 py-20">
            <div className="text-6xl mb-4">🂠</div>
            <p>No hay mesas disponibles.</p>
            <p className="text-sm mt-1">Pide a un admin que cree una mesa.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tables.map(t => <TableCard key={t.id} table={t} onJoin={handleJoin} />)}
          </div>
        )}
      </main>

      {buyInModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-2xl p-6 w-80 border border-gray-700">
            <h3 className="font-bold text-white text-lg mb-4">Unirse a {buyInModal.name}</h3>
            <label className="text-sm text-gray-400 mb-1 block">Buy-in (${buyInModal.buy_in_min}–${buyInModal.buy_in_max})</label>
            <input type="number" value={buyIn} onChange={e => setBuyIn(e.target.value)}
              min={buyInModal.buy_in_min} max={buyInModal.buy_in_max}
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-green-500" />
            <div className="flex gap-2">
              <button onClick={() => setBuyInModal(null)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-xl">Cancelar</button>
              <button onClick={confirmJoin} className="flex-1 bg-green-700 hover:bg-green-600 text-white font-bold py-2 rounded-xl">Entrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
