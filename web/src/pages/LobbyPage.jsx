import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <Card className="w-full max-w-sm shadow-2xl">
        <CardHeader>
          <CardTitle className="text-2xl text-center">♠ PokerSite</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            {['guest','login','register'].map(m => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={mode === m ? 'default' : 'secondary'}
                className="flex-1 text-xs"
                onClick={() => setMode(m)}
              >
                {m === 'guest' ? 'Invitado' : m === 'login' ? 'Iniciar sesión' : 'Registrarse'}
              </Button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-3">
            {mode !== 'login' && (
              <Input value={nick} onChange={e => setNick(e.target.value)} placeholder="Nickname" required minLength={2} maxLength={32} className="h-11" />
            )}
            {mode !== 'guest' && <>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required className="h-11" />
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Contraseña" required minLength={6} className="h-11" />
            </>}
            {err && <p className="text-red-400 text-sm">{err}</p>}
            <Button type="submit" className="w-full h-11 font-bold">
              {mode === 'guest' ? 'Entrar como invitado' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
            </Button>
          </form>
        </CardContent>
      </Card>
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
  const { player, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const { connect, socket } = useSocket();
  const [tables, setTables] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [showAuth, setShowAuth] = useState(false);
  const [buyInModal, setBuyInModal] = useState(null);
  const [buyIn, setBuyIn] = useState('');

  useEffect(() => {
    if (!player) { setShowAuth(true); return; }
    connect();
    fetchTables();
    fetchTournaments();
    const t = setInterval(() => { fetchTables(); fetchTournaments(); }, 8000);

    // Cuando mi torneo arranca, el server me avisa → entro a la mesa
    const s = socket?.current;
    const onStart = ({ tableId }) => {
      if (!tableId) return;
      toast.info('🏆 ¡Tu torneo está comenzando! Entrando a la mesa...');
      navigate(`/table/${tableId}?buyIn=1500`);
    };
    s?.on?.('torneo_iniciado', onStart);

    return () => { clearInterval(t); s?.off?.('torneo_iniciado', onStart); };
  }, [player]);

  async function fetchTables() {
    try {
      const { data } = await api.get('/tables');
      setTables(data);
    } catch {}
  }

  async function fetchTournaments() {
    try {
      const { data } = await api.get('/tournaments');
      setTournaments(data);
    } catch {}
  }

  async function joinTournament(id) {
    try {
      await api.post(`/tournaments/${id}/register`);
      toast.success('¡Inscrito al torneo! Te avisaremos cuando arranque.');
      fetchTournaments();
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se pudo inscribir');
    }
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
            {isAdmin && <button onClick={() => navigate('/admin/bots')} className="text-xs text-yellow-400 hover:text-yellow-300 font-bold">⚙️ Admin</button>}
            <button onClick={() => navigate('/historial')} className="text-xs text-sky-400 hover:text-sky-300 font-bold">📜 Mis manos</button>
            <span className="text-sm text-gray-300">{player.nickname}</span>
            <span className="text-sm text-green-400 font-mono">🎮 ${player.play_chips?.toLocaleString()}</span>
            <button onClick={logout} className="text-xs text-gray-500 hover:text-gray-300">Salir</button>
          </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Torneos */}
        {tournaments.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4">🏆 Campeonatos</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tournaments.map(t => {
                const mine = t.registrations?.some?.(r => r.player_id === player?.id);
                const full = t.registered >= t.max_players;
                const running = t.status === 'running';
                return (
                  <div key={t.id} className="bg-gray-800 rounded-2xl p-5 border border-yellow-800/40">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-white text-lg">{t.name}</h3>
                      <span className={`text-xs px-2 py-1 rounded-full font-semibold ${running ? 'bg-green-900 text-green-300' : 'bg-sky-900 text-sky-300'}`}>
                        {running ? 'En curso' : `${t.registered}/${t.max_players}`}
                      </span>
                    </div>
                    <div className="text-sm text-gray-300 mb-4">
                      Buy-in: <span className="text-white font-mono">${t.buy_in}</span>
                      <span className="mx-2">·</span>
                      Bote: <span className="text-yellow-400 font-mono">${t.prize_pool}</span>
                    </div>
                    <button
                      onClick={() => joinTournament(t.id)}
                      disabled={running || full || mine}
                      className="w-full bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 text-white font-bold py-2 rounded-xl transition-colors"
                    >
                      {running ? 'Ya empezó' : mine ? 'Inscrito ✓' : full ? 'Completo' : 'Inscribirme'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
