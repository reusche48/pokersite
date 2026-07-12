import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getFingerprint } from '../lib/fingerprint';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    // Already connected with same token
    if (socketRef.current?.connected) return;

    // Disconnect stale socket if any
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    const socket = io(window.location.origin, {
      auth: { token, fingerprint: getFingerprint() },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
    });
    socket.on('connect', () => { console.log('[Socket] connected'); setConnected(true); });
    socket.on('disconnect', () => { console.log('[Socket] disconnected'); setConnected(false); });
    socket.on('connect_error', (err) => console.error('[Socket] connect error:', err.message));
    socketRef.current = socket;

    // Señal de interacción humana (endurecimiento anti-bot). Contamos eventos
    // reales de entrada; si hubo alguno, avisamos al servidor cada 25 s. Un bot
    // que hable directo al socket nunca dispara estos eventos → no emite señal.
    if (!window.__interactionWired) {
      window.__interactionWired = true;
      window.__interactions = 0;
      const bump = () => { window.__interactions++; };
      for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
        window.addEventListener(ev, bump, { passive: true });
      }
      setInterval(() => {
        if (window.__interactions > 0 && socketRef.current?.connected) {
          socketRef.current.emit('client_signal', { n: window.__interactions });
          window.__interactions = 0;
        }
      }, 25000);
    }
  }, []);

  function disconnect() {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setConnected(false);
  }

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect]);

  return (
    <SocketContext.Provider value={{ socket: socketRef, connected, connect, disconnect }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
