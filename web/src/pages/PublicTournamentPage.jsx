import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';

// Marcador PÚBLICO de un torneo (Nivel 1). Cualquiera con el link lo ve, sin
// login: muestra inscritos / clasificación en vivo / resultado final, y se
// refresca solo. Al abrir, crea un "invitado de solo mirar" en segundo plano
// (por si luego quiere entrar a ver las mesas en vivo).

const NIVEL_LABEL = { registering: 'Inscripción abierta', running: 'En curso', finished: 'Terminado', cancelled: 'Cancelado' };

export function PublicTournamentPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/tournaments/${id}/public`);
      if (!r.ok) { setErr('Torneo no encontrado'); return; }
      setData(await r.json());
      setErr(null);
    } catch { setErr('Sin conexión'); }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000); // marcador en vivo
    return () => clearInterval(t);
  }, [load]);

  // Invitado automático de solo mirar (best-effort; no bloquea el marcador)
  useEffect(() => {
    if (localStorage.getItem('token')) return;
    fetch('/api/auth/spectator', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.token) { localStorage.setItem('token', d.token); localStorage.setItem('player', JSON.stringify(d.player)); } })
      .catch(() => {});
  }, []);

  if (err) return <Shell><p className="text-gray-400 text-center py-10">{err}</p></Shell>;
  if (!data) return <Shell><p className="text-gray-500 text-center py-10">Cargando marcador…</p></Shell>;

  const statusColor = data.status === 'running' ? 'bg-green-900 text-green-300'
    : data.status === 'registering' ? 'bg-sky-900 text-sky-300'
    : 'bg-gray-800 text-gray-400';

  return (
    <Shell>
      {/* Cabecera */}
      <div className="mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold">🏆 {data.name}</h1>
          <span className={`text-xs px-2 py-1 rounded-full font-semibold ${statusColor}`}>{NIVEL_LABEL[data.status] || data.status}</span>
        </div>
        <div className="text-sm text-gray-400 mt-1 flex flex-wrap gap-x-4 gap-y-1">
          <span>Entrada: <b className="text-white">{data.buyIn}{data.fee ? `+${data.fee}` : ''}</b></span>
          <span>Bote: <b className="text-yellow-400">{data.prizePool}</b></span>
          {data.status === 'running' && data.bigBlind && (
            <span>Nivel {data.nivel} · ciegas <b className="text-sky-300">{data.smallBlind}/{data.bigBlind}{data.ante ? ` a${data.ante}` : ''}</b></span>
          )}
        </div>
      </div>

      {/* ── EN CURSO ── */}
      {data.status === 'running' && (
        <>
          <Section title={`En juego (${data.alive?.length || 0}/${data.total}) · pagan top ${data.paidPlaces}`}>
            {(data.alive || []).map((p) => {
              const enMoney = p.rank <= data.paidPlaces;
              const prize = data.payouts?.[p.rank];
              return (
                <Row key={p.playerId || p.nickname}
                  left={<><span className={`w-6 text-right font-mono text-xs ${enMoney ? 'text-yellow-300' : 'text-gray-500'}`}>{enMoney ? '🏅' : ''}{p.rank}</span><span className="font-semibold truncate">{p.nickname}</span></>}
                  right={<span className="font-mono text-green-400 font-bold">{p.stack?.toLocaleString?.() ?? p.stack}</span>}
                  sub={`Mesa ${p.table}${enMoney && prize ? ` · premio ${prize.toLocaleString()}` : ''}`}
                />
              );
            })}
          </Section>
          {data.eliminated?.length > 0 && (
            <Section title={`Eliminados (${data.eliminated.length})`} muted>
              {data.eliminated.map(p => (
                <Row key={p.playerId || p.nickname}
                  left={<><span className="w-6 text-right font-mono text-xs text-gray-500">{p.position}º</span><span className="text-gray-300 truncate">{p.nickname}</span></>}
                  right={<span className="text-gray-600">💀</span>} />
              ))}
            </Section>
          )}
        </>
      )}

      {/* ── INSCRIPCIÓN ── */}
      {data.status === 'registering' && (
        <Section title={`Inscritos (${data.inscritos?.length || 0}/${data.maxPlayers})`}>
          {(data.inscritos || []).length === 0 && <p className="text-sm text-gray-500 px-1 py-2">Aún nadie inscrito.</p>}
          {(data.inscritos || []).map((p, i) => (
            <Row key={i}
              left={<><span className="w-6 text-right font-mono text-xs text-gray-500">{i + 1}</span><span className="truncate">{p.nickname}{p.isBot ? ' 🤖' : ''}</span></>}
              right={null} />
          ))}
        </Section>
      )}

      {/* ── RESULTADO FINAL ── */}
      {(data.status === 'finished' || data.status === 'cancelled') && (
        <Section title="Resultado final">
          {(data.resultado || []).length === 0 && <p className="text-sm text-gray-500 px-1 py-2">Sin resultados.</p>}
          {(data.resultado || []).map(p => {
            const medal = p.position === 1 ? '🥇' : p.position === 2 ? '🥈' : p.position === 3 ? '🥉' : `${p.position}º`;
            return (
              <Row key={p.nickname}
                left={<><span className="w-8 text-right text-sm">{medal}</span><span className={`truncate ${p.position <= 3 ? 'font-bold' : ''}`}>{p.nickname}</span></>}
                right={p.prize > 0 ? <span className="font-mono text-yellow-400 font-bold">{p.prize.toLocaleString()}</span> : null} />
            );
          })}
        </Section>
      )}

      <p className="text-center text-[11px] text-gray-600 mt-8">Marcador en vivo · se actualiza solo</p>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(80,40,140,0.25) 0%, #0a0a0f 55%)' }}>
      <div className="max-w-md mx-auto px-4 py-6">{children}</div>
    </div>
  );
}
function Section({ title, children, muted }) {
  return (
    <div className={`mb-5 ${muted ? 'opacity-70' : ''}`}>
      <div className="text-[11px] uppercase tracking-wider text-gray-400 font-bold mb-1.5">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
function Row({ left, right, sub }) {
  return (
    <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 bg-white/5">
      <span className="flex items-center gap-2 min-w-0">
        {left && <span className="flex flex-col min-w-0"><span className="flex items-center gap-2 min-w-0">{left}</span>{sub && <span className="text-[10px] text-gray-500 leading-tight ml-8">{sub}</span>}</span>}
      </span>
      {right}
    </div>
  );
}
