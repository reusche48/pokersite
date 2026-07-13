import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { PokerTable } from '../components/table/PokerTable';
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

  useEffect(() => {
    if (!player) { navigate('/'); return; }
    connect();
  }, [player]);

  // Torneo multi-mesa: si me mueven de mesa, el servidor me avisa y navego a la nueva
  useEffect(() => {
    const s = socket?.current;
    if (!s) return;
    const onMove = ({ tableId }) => {
      if (tableId && tableId !== id) navigate(`/table/${tableId}?buyIn=1500`);
    };
    const onEnd = () => { setTimeout(() => navigate('/'), 9000); };
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
    return () => { s.off('torneo_mesa_cambiada', onMove); s.off('torneo_finalizado', onEnd); s.off('torneo_mesa_final', onFinalTable); };
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

  return <PokerTable tableId={id} initialBuyIn={buyIn} spectate={spectate} />;
}
