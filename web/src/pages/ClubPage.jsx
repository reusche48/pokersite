import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Avatar } from '../components/table/Avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { SPEEDS } from '../lib/blindSchedules';

// Velocidades de ciegas (mismos presets que el panel admin).
// Stack inicial = 1500. Las ciegas suben GRADUALMENTE — nunca saltan por
// encima del stack (antes el turbo brincaba a 1000/2000 y todos quedaban
// all-in al instante).
// SPEEDS (estructura de ciegas) se importa de ../lib/blindSchedules (compartido
// con el panel admin y calibrado para el stack inicial de 10.000).

const LEVELS = [5, 6, 7, 8, 9, 10, 11, 12];

export function ClubPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { player } = useAuth();
  const [club, setClub] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('partidas');
  const [nowTick, setNowTick] = useState(Date.now());
  const [buyInModal, setBuyInModal] = useState(null);
  const [buyIn, setBuyIn] = useState('');
  // Bots del dueño
  const [botLevel, setBotLevel] = useState(6);
  const [botCount, setBotCount] = useState(3);
  // Candado anti doble-clic: ignora clics repetidos mientras se crea algo
  const [creating, setCreating] = useState(false);
  // Crear mesa (los numéricos se guardan como TEXTO para no pegar ceros
  // sobrantes ni impedir vaciarlos; se convierten a número al enviar)
  const [mName, setMName] = useState('');
  const [mSB, setMSB] = useState('5');
  const [mBB, setMBB] = useState('10');
  const [mSeats, setMSeats] = useState(6);
  const [mRake, setMRake] = useState('5');
  const [mCap, setMCap] = useState('3');
  // Unión (5D)
  const [uName, setUName] = useState('');
  const [uCode, setUCode] = useState('');
  // Crear torneo
  const [tName, setTName] = useState('');
  const [tMax, setTMax] = useState('9');
  const [tBuyIn, setTBuyIn] = useState('100');
  const [tFee, setTFee] = useState('10');
  const [tBounty, setTBounty] = useState('0');
  const [tSpeed, setTSpeed] = useState('turbo');
  const [tStart, setTStart] = useState('');
  const [tInvite, setTInvite] = useState(false);   // torneo por invitación
  const [invitePicker, setInvitePicker] = useState(null); // torneo para el que se abre el selector de miembros

  async function load() {
    try {
      const { data } = await api.get(`/clubs/${id}`);
      setClub(data);
      setError(null);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo cargar el club');
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    const tick = setInterval(() => setNowTick(Date.now()), 1000);
    return () => { clearInterval(t); clearInterval(tick); };
  }, [id]);

  function copyCode() {
    navigator.clipboard?.writeText(club.clubCode);
    toast.success(`ID ${club.clubCode} copiado — compártelo por WhatsApp`);
  }

  async function joinTournament(tid) {
    try {
      const { data } = await api.post(`/tournaments/${tid}/register`);
      if (data.tableId) { navigate(`/table/${data.tableId}?buyIn=1500`); return; }
      toast.success('¡Inscrito! Te avisaremos cuando arranque.');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'No se pudo inscribir'); }
  }
  async function enterTournament(tid) {
    try {
      const { data } = await api.get(`/tournaments/${tid}/my-table`);
      navigate(`/table/${data.tableId}?buyIn=1500`);
    } catch (e) { toast.error(e.response?.data?.error || 'No se encontró tu mesa'); }
  }
  async function addTournamentBots(tid) {
    try {
      const { data } = await api.post(`/clubs/${id}/tournaments/${tid}/bots`, { level: botLevel, count: botCount });
      toast.success(`${data.added} bots agregados${data.started ? ' — ¡torneo iniciado!' : ''}`);
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Error al agregar bots'); }
  }
  function copyPublicLink(tid) {
    const url = `${window.location.origin}/ver/${tid}`;
    navigator.clipboard?.writeText(url);
    toast.success('🔗 Link público copiado — compártelo para que vean el torneo');
  }
  async function quickFillClubTournament(tid) {
    if (creating) return;
    setCreating(true);
    try {
      const { data } = await api.post(`/clubs/${id}/tournaments/${tid}/quickfill`);
      toast.success('⚡ Torneo lleno con bots y arrancado — entrando...');
      if (data.tableId) navigate(`/table/${data.tableId}?buyIn=1500`);
      else { load(); setCreating(false); }
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se pudo hacer el relleno rápido');
      setCreating(false);
    }
  }
  async function cancelClubTournament(tid, name) {
    if (!window.confirm(`¿Cancelar el torneo "${name}"? Se reembolsa la entrada a todos los inscritos.`)) return;
    try {
      await api.delete(`/clubs/${id}/tournaments/${tid}`);
      toast.success('Torneo cancelado y reembolsado');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'No se pudo cancelar el torneo'); }
  }
  async function deleteTable(tableId, name) {
    if (!window.confirm(`¿Eliminar la mesa "${name}"? Solo se puede si está vacía.`)) return;
    try {
      await api.delete(`/clubs/${id}/tables/${tableId}`);
      toast.success('Mesa eliminada');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'No se pudo eliminar la mesa'); }
  }
  async function addTableBots(tableId) {
    try {
      const { data } = await api.post(`/clubs/${id}/tables/${tableId}/bots`, { level: botLevel, count: botCount, buyIn: 500 });
      toast.success(`${data.seated} bots sentados`);
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Error al sentar bots'); }
  }
  async function kick(pid) {
    try { await api.delete(`/clubs/${id}/members/${pid}`); toast.success('Miembro expulsado'); load(); }
    catch (e) { toast.error(e.response?.data?.error || 'Error'); }
  }
  async function approve(pid) {
    try { await api.post(`/clubs/${id}/members/${pid}/approve`); toast.success('Solicitud aceptada'); load(); }
    catch (e) { toast.error(e.response?.data?.error || 'Error'); }
  }
  async function reject(pid) {
    try { await api.delete(`/clubs/${id}/members/${pid}`); toast.success('Solicitud rechazada'); load(); }
    catch (e) { toast.error(e.response?.data?.error || 'Error'); }
  }
  async function changeJoinMode(mode) {
    try { await api.patch(`/clubs/${id}`, { joinMode: mode }); toast.success(mode === 'approval' ? 'Ahora los ingresos requieren tu aprobación' : 'Ahora el ingreso es directo con el ID'); load(); }
    catch (e) { toast.error(e.response?.data?.error || 'Error'); }
  }
  async function createUnion() {
    try {
      const { data } = await api.post('/clubs/unions', { name: uName });
      toast.success(`¡Unión "${data.name}" creada! Código: ${data.unionCode}`, { duration: 9000 });
      setUName(''); load();
    } catch (e) { toast.error(e.response?.data?.error || 'No se pudo crear la unión'); }
  }
  async function joinUnionByCode() {
    const code = uCode.trim().toUpperCase();
    if (!code) return;
    try {
      const { data } = await api.post('/clubs/unions/join', { code });
      toast.success(`Tu club ahora es parte de la unión "${data.name}"`);
      setUCode(''); load();
    } catch (e) { toast.error(e.response?.data?.error || 'Código de unión no válido'); }
  }
  async function leaveUnion() {
    try { await api.post('/clubs/unions/leave'); toast.success('Tu club salió de la unión'); load(); }
    catch (e) { toast.error(e.response?.data?.error || 'Error'); }
  }
  function copyUnionCode() {
    navigator.clipboard?.writeText(club.union.code);
    toast.success(`Código de unión ${club.union.code} copiado — pásalo a otros dueños de club`);
  }
  async function createTable() {
    if (creating) return;               // ignora doble-clic mientras crea
    setCreating(true);
    try {
      const { data } = await api.post(`/clubs/${id}/tables`, {
        name: mName || 'Mesa del club', smallBlind: mSB, bigBlind: mBB, maxSeats: mSeats,
        rakePct: mRake, rakeCapBB: mCap,
      });
      toast.success(`Mesa "${data.name}" creada`);
      setTab('partidas'); load();
    } catch (e) { toast.error(e.response?.data?.error || 'Error al crear la mesa'); }
    finally { setCreating(false); }
  }
  async function createTournament() {
    if (creating) return;               // ignora doble-clic mientras crea
    setCreating(true);
    try {
      await api.post(`/clubs/${id}/tournaments`, {
        name: tName || 'Torneo del club', maxPlayers: tMax, buyIn: tBuyIn, fee: tFee,
        bounty: tBounty, blindSchedule: SPEEDS[tSpeed]?.schedule || null,
        inviteOnly: tInvite,
        // Convertir la hora local del input a ISO UTC en el navegador (que sabe
        // la zona del usuario). Sin esto, el servidor interpreta la hora en SU
        // zona (Railway = UTC) y el inicio queda descuadrado.
        startsAt: tStart ? new Date(tStart).toISOString() : null,
      });
      toast.success(tStart ? 'Torneo programado' : 'Torneo creado');
      setTab('partidas'); load();
    } catch (e) { toast.error(e.response?.data?.error || 'Error al crear el torneo'); }
    finally { setCreating(false); }
  }
  // Torneo por invitación: abrir el selector de miembros a inscribir
  async function openInvitePicker(t) {
    try {
      const { data } = await api.get(`/tournaments/${t.id}/public`);
      const ins = new Set((data.inscritos || []).map(x => x.nickname));
      setInvitePicker({ id: t.id, name: t.name, inscritos: ins });
    } catch { setInvitePicker({ id: t.id, name: t.name, inscritos: new Set() }); }
  }
  async function inviteMember(tid, playerId, nickname) {
    try {
      await api.post(`/clubs/${id}/tournaments/${tid}/invite`, { playerId });
      toast.success(`${nickname} inscrito`);
      setInvitePicker(p => p ? { ...p, inscritos: new Set([...p.inscritos, nickname]) } : p);
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'No se pudo inscribir'); }
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-4">
        <p>{error}</p>
        <button onClick={() => navigate('/')} className="bg-green-700 px-5 py-2 rounded-lg font-bold">Volver al lobby</button>
      </div>
    );
  }
  if (!club) return <div className="min-h-screen bg-gray-950 text-green-200 flex items-center justify-center animate-pulse">♣ Cargando club...</div>;

  const pendingCount = club.pendingRequests?.length || 0;
  const TABS = [
    { k: 'partidas', label: '🃏 Partidas' },
    { k: 'miembros', label: `👥 Miembros (${club.members.length})${pendingCount ? ` · ⏳${pendingCount}` : ''}` },
    { k: 'union', label: club.union ? `🤝 ${club.union.name}` : '🤝 Unión' },
    ...(club.isOwner ? [{ k: 'crear', label: '➕ Crear' }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white lobby-bg">
      {/* Cabecera del club */}
      <header className="border-b border-purple-900/50 bg-gradient-to-b from-purple-950/60 to-transparent px-4 py-5 relative" style={{ zIndex: 10 }}>
        <div className="max-w-4xl mx-auto flex items-center gap-4 flex-wrap">
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white">←</button>
          <span className="text-4xl">{club.emblem}</span>
          <div className="min-w-0">
            <h1 className="text-xl font-black truncate">{club.name}</h1>
            <button onClick={copyCode} className="text-sm text-purple-300 hover:text-purple-100 font-mono" title="Copiar ID">
              ID del club: <span className="font-bold tracking-widest">{club.clubCode}</span> 📋
            </button>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {club.isOwner && (
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-gray-500">Caja del club</div>
                <div className="text-lg font-black text-yellow-400">💼 {Number(club.treasury).toLocaleString()}</div>
              </div>
            )}
          </div>
        </div>
        {/* Pestañas */}
        <div className="max-w-4xl mx-auto flex gap-2 mt-4 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${tab === t.k ? 'bg-purple-700 text-white' : 'bg-gray-800/80 text-gray-400 hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* ── PARTIDAS ── */}
        {tab === 'partidas' && (
          <>
            {club.isOwner && (
              <div className="mb-5 flex items-center gap-2 text-xs bg-gray-900/70 border border-gray-800 rounded-xl px-3 py-2 flex-wrap">
                <span className="text-gray-400 font-bold">🤖 Bots:</span>
                <span className="text-gray-500">nivel</span>
                <select value={botLevel} onChange={e => setBotLevel(Number(e.target.value))} className="bg-gray-800 border border-gray-700 rounded px-2 py-1">
                  {LEVELS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <span className="text-gray-500">cantidad</span>
                <input type="number" min={1} max={8} value={botCount} onChange={e => setBotCount(Number(e.target.value))}
                  className="w-14 bg-gray-800 border border-gray-700 rounded px-2 py-1" />
                <span className="text-gray-500">→ usa el botón "+ Bots" de cada partida</span>
              </div>
            )}

            <h2 className="font-bold mb-3">🏆 Torneos del club</h2>
            {club.tournaments.length === 0 && <p className="text-sm text-gray-500 mb-6">Ninguno todavía.{club.isOwner ? ' Crea uno en la pestaña ➕.' : ''}</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
              {club.tournaments.map(t => {
                const mine = !!t.am_registered;
                const eliminated = mine && t.my_final_position !== null;
                const playing = mine && t.my_final_position === null;
                const running = t.status === 'running';
                const full = t.registered >= t.max_players;
                let countdown = null;
                if (!running && t.starts_at) {
                  const diff = new Date(t.starts_at).getTime() - nowTick;
                  countdown = diff > 0 ? `${Math.floor(diff / 60000)}m ${String(Math.floor((diff % 60000) / 1000)).padStart(2, '0')}s` : 'por comenzar...';
                }
                return (
                  <div key={t.id} className="bg-gray-800 rounded-2xl p-4 border border-yellow-800/40">
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-bold">{t.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${running ? 'bg-green-900 text-green-300' : 'bg-sky-900 text-sky-300'}`}>
                        {running ? 'En curso' : `${t.registered}/${t.max_players}`}
                      </span>
                    </div>
                    <div className="text-sm text-gray-300 mb-1">
                      Entrada: <span className="text-white font-mono">{Math.round(t.buy_in)}{Number(t.fee) > 0 ? `+${Math.round(t.fee)}` : ''}</span>
                      <span className="mx-2">·</span>
                      Bote: <span className="text-yellow-400 font-mono">{Math.round(t.prize_pool)}</span>
                      {Number(t.bounty) > 0 && <><span className="mx-2">·</span>🎯 {Math.round(t.bounty)}</>}
                    </div>
                    {countdown && <div className="text-sm text-yellow-300 font-semibold mb-2">🕐 Empieza en {countdown}</div>}
                    <div className="flex gap-2 mt-2">
                      {running && playing ? (
                        <button onClick={() => enterTournament(t.id)} className="flex-1 bg-green-700 hover:bg-green-600 font-bold py-2 rounded-xl text-sm">▶ Entrar</button>
                      ) : running && (eliminated || !mine) && t.late_reg_open ? (
                        <button onClick={() => joinTournament(t.id)} className="flex-1 bg-purple-700 hover:bg-purple-600 font-bold py-2 rounded-xl text-sm">
                          {eliminated ? '🔄 Re-entrar' : '🕐 Tardía'} ({Math.round(t.buy_in) + Math.round(t.fee)})
                        </button>
                      ) : running ? (
                        <button disabled className="flex-1 bg-gray-700 opacity-40 font-bold py-2 rounded-xl text-sm">{eliminated ? `Eliminado (${t.my_final_position}º)` : 'En curso'}</button>
                      ) : Number(t.invite_only) === 1 && !club.isOwner ? (
                        <button disabled className="flex-1 bg-gray-700 opacity-50 font-bold py-2 rounded-xl text-sm">{mine ? 'Inscrito ✓' : '🔒 Por invitación'}</button>
                      ) : (
                        <button onClick={() => joinTournament(t.id)} disabled={full || mine}
                          className="flex-1 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 font-bold py-2 rounded-xl text-sm">
                          {mine ? 'Inscrito ✓' : full ? 'Completo' : `Inscribirme (${Math.round(t.buy_in) + Math.round(t.fee)})`}
                        </button>
                      )}
                      {club.isOwner && t.status === 'registering' && (
                        <>
                          <button onClick={() => openInvitePicker(t)}
                            title="Inscribir a un miembro (el que pagó)"
                            className="bg-emerald-800/70 hover:bg-emerald-700 text-emerald-100 px-3 py-2 rounded-xl text-xs font-bold">➕</button>
                          <button onClick={() => quickFillClubTournament(t.id)} disabled={creating}
                            title="Te inscribe, llena con bots aleatorios y arranca (pruebas)"
                            className="bg-fuchsia-800/70 hover:bg-fuchsia-700 disabled:opacity-50 text-fuchsia-100 px-3 py-2 rounded-xl text-xs font-bold">⚡</button>
                          <button onClick={() => addTournamentBots(t.id)} className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-xl text-xs font-bold">+ Bots</button>
                          <button onClick={() => cancelClubTournament(t.id, t.name)} title="Cancelar torneo (reembolsa a los inscritos)"
                            className="bg-red-900/60 hover:bg-red-800 text-red-200 px-3 py-2 rounded-xl text-xs font-bold">🗑</button>
                        </>
                      )}
                    </div>
                    {/* Link público del marcador — cualquiera puede compartirlo */}
                    <button onClick={() => copyPublicLink(t.id)}
                      className="mt-2 w-full text-xs text-sky-300 hover:text-sky-200 font-semibold py-1">
                      🔗 Copiar link para que vean el torneo
                    </button>
                  </div>
                );
              })}
            </div>

            <h2 className="font-bold mb-3">💵 Mesas cash del club</h2>
            {club.tables.length === 0 && <p className="text-sm text-gray-500">Ninguna todavía.{club.isOwner ? ' Crea una en la pestaña ➕.' : ''}</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {club.tables.map(t => (
                <div key={t.id} className="bg-gray-800 rounded-2xl p-4 border border-green-800/40">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold">{t.name}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-900 text-gray-300">{t.seated}/{t.max_seats}</span>
                  </div>
                  <div className="text-sm text-gray-300 mb-3">
                    Ciegas <span className="text-white font-mono">{Math.round(t.small_blind)}/{Math.round(t.big_blind)}</span>
                    {Number(t.rake_pct) > 0 && <><span className="mx-2">·</span>💼 rake {Number(t.rake_pct)}% (máx {t.rake_cap_bb}BB)</>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setBuyInModal(t); setBuyIn(String(t.buy_in_min)); }}
                      className="flex-1 bg-green-700 hover:bg-green-600 font-bold py-2 rounded-xl text-sm">Sentarme</button>
                    {club.isOwner && (
                      <>
                        <button onClick={() => addTableBots(t.id)} className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-xl text-xs font-bold">+ Bots</button>
                        <button onClick={() => deleteTable(t.id, t.name)} title="Eliminar mesa (si está vacía)"
                          className="bg-red-900/60 hover:bg-red-800 text-red-200 px-3 py-2 rounded-xl text-xs font-bold">🗑</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── MIEMBROS ── */}
        {tab === 'miembros' && (
          <div className="space-y-2 max-w-lg">
            {club.isOwner && (
              <div className="flex items-center gap-2 bg-gray-900/70 border border-gray-800 rounded-xl px-3 py-2 text-xs mb-4 flex-wrap">
                <span className="text-gray-400 font-bold">Ingreso al club:</span>
                <button onClick={() => changeJoinMode('open')}
                  className={`px-3 py-1 rounded-lg font-bold ${club.joinMode === 'open' ? 'bg-green-800 text-green-200' : 'bg-gray-800 text-gray-500 hover:text-white'}`}>
                  Directo con el ID
                </button>
                <button onClick={() => changeJoinMode('approval')}
                  className={`px-3 py-1 rounded-lg font-bold ${club.joinMode === 'approval' ? 'bg-yellow-800 text-yellow-200' : 'bg-gray-800 text-gray-500 hover:text-white'}`}>
                  Con mi aprobación
                </button>
              </div>
            )}

            {club.isOwner && pendingCount > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-bold text-yellow-300 mb-2">⏳ Solicitudes de ingreso ({pendingCount})</h3>
                {club.pendingRequests.map(m => (
                  <div key={m.player_id} className="flex items-center gap-3 bg-yellow-950/40 border border-yellow-800/50 rounded-xl px-3 py-2 mb-2">
                    <Avatar nickname={m.nickname} avatarConfig={typeof m.avatar_config === 'string' ? JSON.parse(m.avatar_config || 'null') : m.avatar_config} size={34} />
                    <div className="min-w-0 flex-1 font-bold text-sm truncate">{m.nickname}</div>
                    <button onClick={() => approve(m.player_id)} className="text-xs bg-green-800 hover:bg-green-700 px-3 py-1.5 rounded-lg font-bold">Aceptar</button>
                    <button onClick={() => reject(m.player_id)} className="text-xs bg-red-900/70 hover:bg-red-800 px-3 py-1.5 rounded-lg">Rechazar</button>
                  </div>
                ))}
              </div>
            )}

            {club.members.map(m => (
              <div key={m.player_id} className="flex items-center gap-3 bg-gray-900/70 border border-gray-800 rounded-xl px-3 py-2">
                <Avatar nickname={m.nickname} avatarConfig={typeof m.avatar_config === 'string' ? JSON.parse(m.avatar_config || 'null') : m.avatar_config} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm truncate">{m.nickname}{m.player_id === player?.id ? ' (tú)' : ''}</div>
                  <div className="text-[11px] text-gray-500">{m.role === 'owner' ? '👑 Dueño' : 'Miembro'}</div>
                </div>
                {club.isOwner && m.player_id !== player?.id && (
                  <button onClick={() => kick(m.player_id)} className="text-xs bg-red-900/70 hover:bg-red-800 px-3 py-1.5 rounded-lg">Expulsar</button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── UNIÓN (Fase 5D): clubes aliados comparten partidas ── */}
        {tab === 'union' && !club.union && (
          <div className="max-w-lg space-y-4">
            <p className="text-sm text-gray-400">
              Una <b>unión</b> alía varios clubes: los miembros de cualquier club de la unión
              pueden jugar las mesas y torneos de los demás. Ideal para juntar más jugadores.
            </p>
            {club.isOwner ? (
              <>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
                  <h2 className="font-bold">🤝 Crear una unión</h2>
                  <p className="text-[11px] text-gray-500">Tu club queda como fundador y recibes un código para invitar a otros clubes.</p>
                  <div className="flex gap-2">
                    <Input value={uName} onChange={e => setUName(e.target.value)} placeholder="Nombre de la unión" maxLength={40} />
                    <Button onClick={createUnion} className="font-bold shrink-0">Crear</Button>
                  </div>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
                  <h2 className="font-bold">🔗 Unir mi club a una unión</h2>
                  <p className="text-[11px] text-gray-500">Pide el código al dueño del club fundador.</p>
                  <div className="flex gap-2">
                    <Input value={uCode} onChange={e => setUCode(e.target.value.toUpperCase())} placeholder="CÓDIGO DE UNIÓN" maxLength={8} className="font-mono tracking-widest" />
                    <Button onClick={joinUnionByCode} className="font-bold shrink-0">Unirme</Button>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">Este club aún no pertenece a ninguna unión. Solo el dueño puede unirlo a una.</p>
            )}
          </div>
        )}

        {tab === 'union' && club.union && (
          <>
            <div className="flex items-center gap-4 flex-wrap mb-5">
              <div>
                <h2 className="font-black text-lg">🤝 {club.union.name}</h2>
                <button onClick={copyUnionCode} className="text-sm text-purple-300 hover:text-purple-100 font-mono" title="Copiar código">
                  Código de la unión: <span className="font-bold tracking-widest">{club.union.code}</span> 📋
                </button>
              </div>
              {club.isOwner && !club.union.isFounder && (
                <button onClick={leaveUnion} className="ml-auto text-xs bg-red-900/70 hover:bg-red-800 px-3 py-1.5 rounded-lg">Salir de la unión</button>
              )}
            </div>

            <h3 className="text-sm font-bold text-gray-400 mb-2">Clubes de la unión</h3>
            <div className="flex gap-3 flex-wrap mb-8">
              {club.union.clubs.map(c => (
                <div key={c.id} className={`flex items-center gap-2 rounded-xl px-4 py-2 border ${c.id === club.id ? 'bg-purple-950/60 border-purple-700/50' : 'bg-gray-900/70 border-gray-800'}`}>
                  <span className="text-2xl">{c.emblem}</span>
                  <span>
                    <span className="block font-bold text-sm">{c.name}{c.id === club.id ? ' (este club)' : ''}</span>
                    <span className="block text-[11px] text-gray-500">
                      {c.id === club.union.founderClubId ? '⭐ Fundador · ' : ''}{c.members} 👥
                    </span>
                  </span>
                </div>
              ))}
            </div>

            <h3 className="font-bold mb-3">🏆 Torneos de clubes aliados</h3>
            {club.unionTournaments.length === 0 && <p className="text-sm text-gray-500 mb-6">Ninguno activo ahora.</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
              {club.unionTournaments.map(t => {
                const mine = !!t.am_registered;
                const eliminated = mine && t.my_final_position !== null;
                const playing = mine && t.my_final_position === null;
                const running = t.status === 'running';
                const full = t.registered >= t.max_players;
                return (
                  <div key={t.id} className="bg-gray-800 rounded-2xl p-4 border border-yellow-800/40">
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-bold">{t.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${running ? 'bg-green-900 text-green-300' : 'bg-sky-900 text-sky-300'}`}>
                        {running ? 'En curso' : `${t.registered}/${t.max_players}`}
                      </span>
                    </div>
                    <div className="text-[11px] text-purple-300 mb-1">{t.club_emblem} {t.club_name}</div>
                    <div className="text-sm text-gray-300 mb-2">
                      Entrada: <span className="text-white font-mono">{Math.round(t.buy_in)}{Number(t.fee) > 0 ? `+${Math.round(t.fee)}` : ''}</span>
                      <span className="mx-2">·</span>
                      Bote: <span className="text-yellow-400 font-mono">{Math.round(t.prize_pool)}</span>
                    </div>
                    {running && playing ? (
                      <button onClick={() => enterTournament(t.id)} className="w-full bg-green-700 hover:bg-green-600 font-bold py-2 rounded-xl text-sm">▶ Entrar</button>
                    ) : running && (eliminated || !mine) && t.late_reg_open ? (
                      <button onClick={() => joinTournament(t.id)} className="w-full bg-purple-700 hover:bg-purple-600 font-bold py-2 rounded-xl text-sm">
                        {eliminated ? '🔄 Re-entrar' : '🕐 Tardía'} ({Math.round(t.buy_in) + Math.round(t.fee)})
                      </button>
                    ) : running ? (
                      <button disabled className="w-full bg-gray-700 opacity-40 font-bold py-2 rounded-xl text-sm">{eliminated ? `Eliminado (${t.my_final_position}º)` : 'En curso'}</button>
                    ) : (
                      <button onClick={() => joinTournament(t.id)} disabled={full || mine}
                        className="w-full bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 font-bold py-2 rounded-xl text-sm">
                        {mine ? 'Inscrito ✓' : full ? 'Completo' : `Inscribirme (${Math.round(t.buy_in) + Math.round(t.fee)})`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <h3 className="font-bold mb-3">💵 Mesas cash de clubes aliados</h3>
            {club.unionTables.length === 0 && <p className="text-sm text-gray-500">Ninguna activa ahora.</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {club.unionTables.map(t => (
                <div key={t.id} className="bg-gray-800 rounded-2xl p-4 border border-green-800/40">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold">{t.name}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-900 text-gray-300">{t.seated}/{t.max_seats}</span>
                  </div>
                  <div className="text-[11px] text-purple-300 mb-1">{t.club_emblem} {t.club_name}</div>
                  <div className="text-sm text-gray-300 mb-3">
                    Ciegas <span className="text-white font-mono">{Math.round(t.small_blind)}/{Math.round(t.big_blind)}</span>
                    {Number(t.rake_pct) > 0 && <><span className="mx-2">·</span>💼 rake {Number(t.rake_pct)}% (máx {t.rake_cap_bb}BB)</>}
                  </div>
                  <button onClick={() => { setBuyInModal(t); setBuyIn(String(t.buy_in_min)); }}
                    className="w-full bg-green-700 hover:bg-green-600 font-bold py-2 rounded-xl text-sm">Sentarme</button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── CREAR (solo dueño) ── */}
        {tab === 'crear' && club.isOwner && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
              <h2 className="font-bold">💵 Nueva mesa cash</h2>
              <div><Label className="text-[10px] text-gray-500">Nombre</Label>
                <Input value={mName} onChange={e => setMName(e.target.value)} placeholder="Mesa del club" /></div>
              <div className="flex gap-2">
                <div className="flex-1"><Label className="text-[10px] text-gray-500">Ciega chica</Label>
                  <Input type="number" inputMode="numeric" value={mSB} onChange={e => setMSB(e.target.value)} /></div>
                <div className="flex-1"><Label className="text-[10px] text-gray-500">Ciega grande</Label>
                  <Input type="number" inputMode="numeric" value={mBB} onChange={e => setMBB(e.target.value)} /></div>
                <div className="w-24"><Label className="text-[10px] text-gray-500">Asientos</Label>
                  <select value={mSeats} onChange={e => setMSeats(Number(e.target.value))} className="w-full bg-gray-800 border border-gray-700 rounded-md px-2 py-2 text-sm">
                    {[2, 4, 6, 9].map(n => <option key={n} value={n}>{n}</option>)}
                  </select></div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1"><Label className="text-[10px] text-gray-500">Comisión (rake) % — 0 a 10</Label>
                  <Input type="number" inputMode="numeric" min={0} max={10} value={mRake} onChange={e => setMRake(e.target.value)} /></div>
                <div className="flex-1"><Label className="text-[10px] text-gray-500">Tope en ciegas grandes — 0 a 5</Label>
                  <Input type="number" inputMode="numeric" min={0} max={5} value={mCap} onChange={e => setMCap(e.target.value)} /></div>
              </div>
              <p className="text-[11px] text-gray-500">La comisión se cobra de cada bote (solo si hubo flop) y va a la caja del club.</p>
              <Button onClick={createTable} disabled={creating} className="w-full font-bold">{creating ? 'Creando…' : 'Crear mesa'}</Button>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
              <h2 className="font-bold">🏆 Nuevo torneo</h2>
              <div><Label className="text-[10px] text-gray-500">Nombre</Label>
                <Input value={tName} onChange={e => setTName(e.target.value)} placeholder="Torneo del club" /></div>
              <div className="flex gap-2">
                <div className="flex-1"><Label className="text-[10px] text-gray-500">Jugadores (2–30)</Label>
                  <Input type="number" inputMode="numeric" min={2} max={30} value={tMax} onChange={e => setTMax(e.target.value)} /></div>
                <div className="flex-1"><Label className="text-[10px] text-gray-500">Buy-in</Label>
                  <Input type="number" inputMode="numeric" min={0} value={tBuyIn} onChange={e => setTBuyIn(e.target.value)} /></div>
                <div className="flex-1"><Label className="text-[10px] text-gray-500">Comisión (fee)</Label>
                  <Input type="number" inputMode="numeric" min={0} value={tFee} onChange={e => setTFee(e.target.value)} /></div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1"><Label className="text-[10px] text-gray-500">Bounty por cabeza</Label>
                  <Input type="number" inputMode="numeric" min={0} value={tBounty} onChange={e => setTBounty(e.target.value)} /></div>
                <div className="flex-1"><Label className="text-[10px] text-gray-500">Velocidad</Label>
                  <select value={tSpeed} onChange={e => setTSpeed(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-md px-2 py-2 text-sm">
                    {Object.entries(SPEEDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select></div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] text-gray-500">Inicio programado (opcional)</Label>
                  {tStart && (
                    <button type="button" onClick={() => setTStart('')} className="text-[10px] text-red-400 hover:text-red-300 font-semibold">✕ Quitar hora</button>
                  )}
                </div>
                <Input type="datetime-local" value={tStart} onChange={e => setTStart(e.target.value)} />
                <p className="text-[10px] text-gray-600 mt-1">Sin hora: arranca al llenarse (o con el botón ⚡).</p>
              </div>
              <label className="flex items-start gap-2 cursor-pointer bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2">
                <input type="checkbox" checked={tInvite} onChange={e => setTInvite(e.target.checked)} className="mt-0.5 accent-fuchsia-600" />
                <span className="text-xs">
                  <b className="text-fuchsia-300">🔒 Por invitación</b> — solo tú inscribes a los jugadores (el que pagó). Los demás solo pueden mirar.
                </span>
              </label>
              <p className="text-[11px] text-gray-500">La entrada es "buy-in + fee": el buy-in va al pozo de premios y el fee a la caja del club.</p>
              <Button onClick={createTournament} disabled={creating} className="w-full font-bold">{creating ? 'Creando…' : 'Crear torneo'}</Button>
            </div>
          </div>
        )}
      </main>

      {/* Modal de buy-in para sentarse en una mesa del club */}
      <Dialog open={!!buyInModal} onOpenChange={(o) => { if (!o) setBuyInModal(null); }}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader><DialogTitle>Sentarme en {buyInModal?.name}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs text-gray-400">
              Buy-in ({Math.round(buyInModal?.buy_in_min || 0)}–{Math.round(buyInModal?.buy_in_max || 0)})
            </Label>
            <Input type="number" value={buyIn} onChange={e => setBuyIn(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setBuyInModal(null)}>Cancelar</Button>
            <Button onClick={() => { navigate(`/table/${buyInModal.id}?buyIn=${buyIn}`); setBuyInModal(null); }} className="font-bold">Entrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Selector de miembros para inscribir en un torneo (por invitación) */}
      <Dialog open={!!invitePicker} onOpenChange={(o) => { if (!o) setInvitePicker(null); }}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle>Inscribir en {invitePicker?.name}</DialogTitle></DialogHeader>
          <p className="text-xs text-gray-400 -mt-2">Agrega a los que te pagaron. El resto solo mira.</p>
          <div className="overflow-y-auto space-y-1.5 mt-2 pr-1">
            {(club?.members || []).map(m => {
              const ya = invitePicker?.inscritos?.has(m.nickname);
              return (
                <div key={m.player_id} className="flex items-center gap-3 bg-gray-800/70 rounded-lg px-3 py-2">
                  <Avatar nickname={m.nickname} avatarConfig={typeof m.avatar_config === 'string' ? JSON.parse(m.avatar_config || 'null') : m.avatar_config} size={30} />
                  <span className="flex-1 min-w-0 text-sm truncate">{m.nickname}{m.role === 'owner' ? ' 👑' : ''}</span>
                  {ya
                    ? <span className="text-xs text-green-400 font-semibold shrink-0">Inscrito ✓</span>
                    : <button onClick={() => inviteMember(invitePicker.id, m.player_id, m.nickname)}
                        className="text-xs bg-emerald-800 hover:bg-emerald-700 px-3 py-1.5 rounded-lg font-bold shrink-0">Agregar</button>}
                </div>
              );
            })}
          </div>
          <DialogFooter><Button variant="secondary" onClick={() => setInvitePicker(null)}>Listo</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
