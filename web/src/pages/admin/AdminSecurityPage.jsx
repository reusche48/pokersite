import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AdminNav } from './AdminNav';
import api from '../../services/api';
import { Card, CardHeader, CardContent, CardDescription } from '@/components/ui/card';

// Panel de vigilancia anti-fraude. Muestra las señales de /admin/security
// (mismo dispositivo, misma IP, flujo de fichas, baneados) para revisión
// humana. Nada banea solo: el admin decide con la evidencia a la vista.
export function AdminSecurityPage() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null); // playerId en proceso de ban/unban

  async function load() {
    try { const { data } = await api.get('/admin/security'); setData(data); } catch {}
  }
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);

  async function ban(id, nickname, scoreAt) {
    const reason = window.prompt(`Motivo del baneo de "${nickname}" (queda en la bitácora):`, '');
    if (reason === null) return; // canceló
    setBusy(id);
    try {
      const { data } = await api.post(`/admin/players/${id}/ban`, { banned: true, reason, scoreAt });
      toast.success(`${data.nickname} baneado${data.kicked ? ` (${data.kicked} sesión expulsada)` : ''}`);
      await load();
    } catch (e) { toast.error(e.response?.data?.error || 'No se pudo banear'); }
    finally { setBusy(null); }
  }
  async function unban(id, nickname) {
    setBusy(id);
    try {
      await api.post(`/admin/players/${id}/ban`, { banned: false });
      toast.success(`${nickname} desbaneado`);
      await load();
    } catch (e) { toast.error(e.response?.data?.error || 'No se pudo desbanear'); }
    finally { setBusy(null); }
  }

  const [training, setTraining] = useState(false);
  async function trainModel() {
    setTraining(true);
    try {
      const { data } = await api.post('/admin/ml/train');
      toast.success(`Modelo reentrenado · precisión ${Math.round(data.test.acc * 100)}% · detecta ${data.validacionBotsReales.detectados}/${data.validacionBotsReales.n} bots reales`);
      await load();
    } catch (e) { toast.error(e.response?.data?.error || 'No se pudo entrenar'); }
    finally { setTraining(false); }
  }

  function BanBtn({ id, nickname, scoreAt }) {
    return (
      <button
        onClick={() => ban(id, nickname, scoreAt)}
        disabled={busy === id}
        className="text-[11px] font-semibold px-2 py-0.5 rounded bg-red-900/50 text-red-300 hover:bg-red-800 hover:text-white transition disabled:opacity-40 shrink-0"
        title={`Banear a ${nickname}`}
      >
        {busy === id ? '…' : '⛔ Banear'}
      </button>
    );
  }

  function timeAgo(v) {
    if (!v) return '';
    const d = (Date.now() - new Date(v).getTime()) / 1000;
    if (d < 60) return 'hace segundos';
    if (d < 3600) return `hace ${Math.floor(d / 60)} min`;
    if (d < 86400) return `hace ${Math.floor(d / 3600)} h`;
    return `hace ${Math.floor(d / 86400)} d`;
  }

  const NIVEL = {
    rojo:     { chip: 'bg-red-900/60 text-red-300 border-red-700', dot: 'bg-red-500', label: 'Rojo' },
    naranja:  { chip: 'bg-orange-900/50 text-orange-300 border-orange-700', dot: 'bg-orange-500', label: 'Naranja' },
    amarillo: { chip: 'bg-yellow-900/40 text-yellow-300 border-yellow-700', dot: 'bg-yellow-500', label: 'Amarillo' },
    verde:    { chip: 'bg-green-900/40 text-green-300 border-green-800', dot: 'bg-green-500', label: 'Verde' },
  };

  if (!data) return <AdminNav><p className="p-8 text-gray-500">Cargando…</p></AdminNav>;

  const jugadores = data.jugadores || [];
  // El mapa de riesgo destaca a los que NO son verdes; los verdes van resumidos.
  const enRiesgo = jugadores.filter(j => j.nivel !== 'verde');
  const totalAlertas = data.mismoDispositivo.length + data.mismaIp.length + data.flujoFichas.length + enRiesgo.length;

  return (
    <AdminNav>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-baseline justify-between mb-1">
          <h1 className="text-2xl font-bold">🛡️ Seguridad</h1>
          <span className="text-xs text-gray-500">actualiza cada 15 s</span>
        </div>
        <p className="text-sm text-gray-400 mb-6">
          Señales de posible trampa para <b>revisión humana</b>. Ninguna banea sola —
          son alertas: tú decides con la evidencia a la vista.
        </p>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {[
            { label: 'En riesgo', value: enRiesgo.length, tone: enRiesgo.length ? 'text-orange-400' : 'text-gray-500' },
            { label: 'Mismo dispositivo', value: data.mismoDispositivo.length, tone: data.mismoDispositivo.length ? 'text-orange-400' : 'text-gray-500' },
            { label: 'Misma IP / red', value: data.mismaIp.length, tone: data.mismaIp.length ? 'text-yellow-400' : 'text-gray-500' },
            { label: 'Flujo raro', value: data.flujoFichas.length, tone: data.flujoFichas.length ? 'text-yellow-400' : 'text-gray-500' },
            { label: 'Baneados', value: data.baneados.length, tone: 'text-red-400' },
          ].map(k => (
            <Card key={k.label}>
              <CardHeader className="pb-0">
                <CardDescription className="text-[10px] uppercase tracking-wider">{k.label}</CardDescription>
              </CardHeader>
              <CardContent><div className={`text-2xl font-bold ${k.tone}`}>{k.value}</div></CardContent>
            </Card>
          ))}
        </div>

        {totalAlertas === 0 && (
          <div className="bg-green-950/40 border border-green-900 rounded-xl px-4 py-6 text-center text-green-300 mb-8">
            ✓ Sin alertas activas. Cuando haya cuentas sospechosas aparecerán aquí.
          </div>
        )}

        {/* ── Modelo de IA (detector de bots) ── */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold flex items-center gap-2">🧠 Detector de bots (IA)</h2>
            <button
              onClick={trainModel}
              disabled={training}
              className="text-xs font-semibold px-3 py-1 rounded bg-sky-900/60 text-sky-300 hover:bg-sky-800 hover:text-white transition disabled:opacity-40"
            >
              {training ? 'Entrenando…' : '↻ Reentrenar'}
            </button>
          </div>
          {!data.modeloIA ? (
            <p className="text-sm text-gray-500">Sin modelo entrenado. Pulsa <b>Reentrenar</b> para crear el detector.</p>
          ) : (
            <div className="bg-gray-900 border border-sky-900/40 rounded-lg p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">Precisión (test)</div>
                  <div className="text-xl font-bold text-sky-300">{Math.round(data.modeloIA.test.acc * 100)}%</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">Recall / F1</div>
                  <div className="text-xl font-bold text-sky-300">{Math.round(data.modeloIA.test.recall * 100)}% / {data.modeloIA.test.f1.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">Bots reales detectados</div>
                  <div className="text-xl font-bold text-green-400">
                    {data.modeloIA.validacionBotsReales.detectados}/{data.modeloIA.validacionBotsReales.n}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">Entrenado con</div>
                  <div className="text-xl font-bold text-gray-300">{data.modeloIA.entrenadoConSinteticos}</div>
                </div>
              </div>
              <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
                Regresión logística sobre distribuciones documentadas de juego automatizado vs orgánico,
                validada contra los bots reales del sistema. Complementa las reglas de timing con una
                probabilidad calibrada. Mejora al reentrenar cuando haya humanos con historial.
              </p>
            </div>
          )}
        </section>

        {/* ── Mapa de riesgo (ranking por score) ── */}
        {enRiesgo.length > 0 && (
          <section className="mb-8">
            <h2 className="font-bold mb-1 flex items-center gap-2">
              🎯 Mapa de riesgo
              <span className="text-xs font-normal text-gray-500">— jugadores con señales, ordenados por score</span>
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              El score combina timing (anti-bot), multicuenta y colusión. Cada uno lleva sus motivos.
              <b className="text-gray-400"> Ninguno se banea solo</b> — decide tú.
            </p>
            <div className="space-y-2">
              {enRiesgo.map(j => {
                const nv = NIVEL[j.nivel] || NIVEL.verde;
                return (
                  <div key={j.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${nv.dot} shrink-0`}></span>
                      <span className="font-semibold truncate">{j.nickname}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${nv.chip}`}>{nv.label} · {j.score}</span>
                      <span className="text-[11px] text-gray-500 font-mono">
                        {j.perfil.manos} manos
                        {j.perfil.reaccionMediaMs != null && ` · ${j.perfil.reaccionMediaMs}ms (CV ${j.perfil.reaccionCV})`}
                        {j.perfil.iaProb != null && <span className="text-sky-400"> · IA {Math.round(j.perfil.iaProb * 100)}%</span>}
                        {j.perfil.vpip != null && ` · VPIP ${j.perfil.vpip}/PFR ${j.perfil.pfr}`}
                      </span>
                      <div className="ml-auto shrink-0">
                        {j.isBot
                          ? <span className="text-[10px] text-gray-600 font-mono">bot (control)</span>
                          : <BanBtn id={j.id} nickname={j.nickname} scoreAt={j.score} />}
                      </div>
                    </div>
                    <ul className="mt-2 space-y-0.5">
                      {j.motivos.map((m, k) => (
                        <li key={k} className="text-xs text-gray-400 flex gap-1.5">
                          <span className="text-gray-600">·</span>{m}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Mismo dispositivo (señal más fuerte) ── */}
        {data.mismoDispositivo.length > 0 && (
          <section className="mb-8">
            <h2 className="font-bold mb-1 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-orange-500"></span>
              Cuentas en el mismo dispositivo
              <span className="text-xs font-normal text-gray-500">— multicuenta casi segura</span>
            </h2>
            <p className="text-xs text-gray-500 mb-3">Varias cuentas de humano conectadas desde el mismo aparato (huella idéntica) en 30 días.</p>
            <div className="space-y-2">
              {data.mismoDispositivo.map((g, i) => (
                <div key={i} className="bg-gray-900 border border-orange-900/40 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2 text-xs text-gray-400">
                    <span className="font-mono bg-black/40 px-2 py-0.5 rounded">huella {String(g.clave).slice(0, 12)}…</span>
                    <span className="font-bold text-orange-300">{g.cuentas} cuentas</span>
                    <span className="ml-auto">{timeAgo(g.ultima_vez)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {g.jugadores.map(j => (
                      <span key={j.id} className="flex items-center gap-1.5 bg-gray-800 rounded px-2 py-1 text-sm">
                        <span className="truncate max-w-[140px]">{j.nickname}</span>
                        <BanBtn id={j.id} nickname={j.nickname} />
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Misma IP ── */}
        {data.mismaIp.length > 0 && (
          <section className="mb-8">
            <h2 className="font-bold mb-1 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-yellow-500"></span>
              Cuentas desde la misma IP / red
              <span className="text-xs font-normal text-gray-500">— multicuenta o misma casa</span>
            </h2>
            <p className="text-xs text-gray-500 mb-3">Puede ser familia en el mismo WiFi (legítimo) o una persona con varias cuentas. Cruza con la huella de dispositivo para confirmar.</p>
            <div className="space-y-2">
              {data.mismaIp.map((g, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2 text-xs text-gray-400">
                    <span className="font-mono bg-black/40 px-2 py-0.5 rounded">{g.clave}</span>
                    <span className="font-bold text-yellow-300">{g.cuentas} cuentas</span>
                    <span className="ml-auto">{timeAgo(g.ultima_vez)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {g.jugadores.map(j => (
                      <span key={j.id} className="flex items-center gap-1.5 bg-gray-800 rounded px-2 py-1 text-sm">
                        <span className="truncate max-w-[140px]">{j.nickname}</span>
                        <BanBtn id={j.id} nickname={j.nickname} />
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Flujo de fichas (chip dumping) ── */}
        {data.flujoFichas.length > 0 && (
          <section className="mb-8">
            <h2 className="font-bold mb-1 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-yellow-500"></span>
              Flujo de fichas sospechoso
              <span className="text-xs font-normal text-gray-500">— posible chip dumping</span>
            </h2>
            <p className="text-xs text-gray-500 mb-3">Un jugador que pierde fichas casi siempre contra el mismo rival, en muchas manos y de forma desbalanceada.</p>
            <div className="space-y-2">
              {data.flujoFichas.map((f, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-sm flex-1 min-w-[240px]">
                    <span className="flex items-center gap-1.5">
                      {f.pierde}
                      {f.pierdeId && <BanBtn id={f.pierdeId} nickname={f.pierde} />}
                    </span>
                    <span className="text-yellow-400 font-mono">— {f.fichas.toLocaleString()} →</span>
                    <span className="flex items-center gap-1.5">
                      {f.gana}
                      {f.ganaId && <BanBtn id={f.ganaId} nickname={f.gana} />}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 font-mono shrink-0">
                    {f.manos} manos · inverso {f.fichasInverso.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Baneados ── */}
        <section>
          <h2 className="font-bold mb-3 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500"></span>
            Jugadores baneados ({data.baneados.length})
          </h2>
          {data.baneados.length === 0 ? (
            <p className="text-sm text-gray-500">Ninguno.</p>
          ) : (
            <div className="space-y-1.5">
              {data.baneados.map(b => (
                <div key={b.id} className={`bg-gray-900 border rounded-lg px-3 py-2 text-sm ${b.appeal_text ? 'border-yellow-700/60' : 'border-red-900/40'}`}>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-red-400">⛔</span>
                      <span className="truncate">{b.nickname}</span>
                      {b.appeal_text && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-300">apeló</span>}
                    </span>
                    <button
                      onClick={() => unban(b.id, b.nickname)}
                      disabled={busy === b.id}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded bg-gray-800 text-gray-300 hover:bg-green-900/60 hover:text-green-300 transition disabled:opacity-40 shrink-0"
                    >
                      {busy === b.id ? '…' : b.appeal_text ? 'Aceptar apelación' : 'Desbanear'}
                    </button>
                  </div>
                  {b.ban_reason && <div className="text-xs text-gray-500 mt-1">Motivo: {b.ban_reason}</div>}
                  {b.appeal_text && <div className="text-xs text-yellow-200/80 mt-1 italic">Apelación: “{b.appeal_text}”</div>}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Bitácora de moderación ── */}
        {data.bitacora && data.bitacora.length > 0 && (
          <section className="mt-8">
            <h2 className="font-bold mb-3 flex items-center gap-2">📋 Bitácora de moderación</h2>
            <div className="space-y-1">
              {data.bitacora.map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-xs px-3 py-1.5 bg-gray-900/60 rounded">
                  <span className={`font-mono font-bold ${m.action === 'ban' ? 'text-red-400' : m.action === 'unban' ? 'text-green-400' : 'text-gray-400'}`}>
                    {m.action}
                  </span>
                  <span className="text-gray-300 truncate">{m.nickname}</span>
                  {m.score_at != null && <span className="text-gray-600">score {m.score_at}</span>}
                  {m.reason && <span className="text-gray-500 truncate">· {m.reason}</span>}
                  <span className="text-gray-600 ml-auto shrink-0">{timeAgo(m.at)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </AdminNav>
  );
}
