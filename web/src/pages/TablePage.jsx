import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PokerTable } from '../components/table/PokerTable';
import { ChampionOverlay } from '../components/tournament/ChampionOverlay';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { playSfx } from '../sounds/sfx';

export function TablePage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const buyIn = searchParams.get('buyIn') || '500';
  const spectate = searchParams.get('watch') === '1';
  const { player } = useAuth();
  const { socket, connected, connect } = useSocket();
  const navigate = useNavigate();
  const [champ, setChamp] = useState(null); // tarjeta de campeón si YO gané

  useEffect(() => {
    if (!player) { navigate('/'); return; }
    connect();
  }, [player]);

  // Torneo multi-mesa: si me mueven de mesa, el servidor me avisa y navego a la nueva
  useEffect(() => {
    const s = socket?.current;
    if (!s) return;
    // Timer para volver al lobby si esta mesa (de torneo) se cierra y a mí NO me
    // mueven (soy espectador o quedé eliminado). Si me mueven, se cancela.
    let closeTimer = null;
    const onMove = ({ tableId }) => {
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
      if (tableId && tableId !== id) navigate(`/table/${tableId}?buyIn=1500`);
    };
    // Fin del torneo: si YO soy el campeón, muestro la tarjeta de felicitación
    // (no me saca al lobby hasta que la cierre). Si no, vuelvo al lobby.
    const onEnd = (data) => {
      if (data?.champion && data.champion.playerId === player?.id) {
        playSfx('victory_fanfare');
        setChamp(data);
      } else {
        setTimeout(() => navigate('/'), 9000);
      }
    };
    // La mesa se cerró al formar la mesa final. A los jugadores activos ya los
    // mueve onMove (que cancela este timer); los que solo miraban vuelven al lobby.
    const onTableClosed = () => {
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        toast('La mesa se cerró al formar la mesa final.');
        navigate('/');
      }, 700);
    };
    // Reconectar a una mesa que ya no existe (rota al formar la mesa final) →
    // volver al lobby en vez de quedarse en "Conectando…" para siempre.
    const onErr = (err) => {
      if (err?.code === 'TABLE_NOT_FOUND') { toast('Esa mesa ya no está disponible.'); navigate('/'); }
    };
    // ¡Mesa final! Aviso destacado + sonido de suspenso (latido) cuando el
    // torneo colapsa a una sola mesa.
    const onFinalTable = ({ players }) => {
      playSfx('suspense');
      toast('🏆 ¡MESA FINAL!', {
        description: players ? `Quedan ${players} jugadores. ¡A por el título!` : '¡A por el título!',
        duration: 9000,
      });
    };
    s.on('torneo_mesa_cambiada', onMove);
    s.on('torneo_finalizado', onEnd);
    s.on('torneo_mesa_final', onFinalTable);
    s.on('torneo_mesa_cerrada', onTableClosed);
    s.on('error', onErr);
    return () => {
      if (closeTimer) clearTimeout(closeTimer);
      s.off('torneo_mesa_cambiada', onMove); s.off('torneo_finalizado', onEnd);
      s.off('torneo_mesa_final', onFinalTable); s.off('torneo_mesa_cerrada', onTableClosed); s.off('error', onErr);
    };
  }, [socket, id, connected]);

  if (!player) return null;
  if (!connected) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-white text-xl">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">♠</div>
          Conectando al servidor...
        </div>
      </div>
    );
  }

  return (
    <>
      <PokerTable tableId={id} initialBuyIn={buyIn} spectate={spectate} />
      {champ && <ChampionOverlay data={champ} onClose={() => { setChamp(null); navigate('/'); }} />}
    </>
  );
}
