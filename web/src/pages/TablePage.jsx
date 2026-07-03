import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { PokerTable } from '../components/table/PokerTable';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

export function TablePage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const buyIn = searchParams.get('buyIn') || '500';
  const { player } = useAuth();
  const { socket, connected, connect } = useSocket();
  const navigate = useNavigate();

  useEffect(() => {
    if (!player) { navigate('/'); return; }
    connect();
  }, [player]);

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

  return <PokerTable tableId={id} initialBuyIn={buyIn} />;
}
