import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

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
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
    });
    socket.on('connect', () => { console.log('[Socket] connected'); setConnected(true); });
    socket.on('disconnect', () => { console.log('[Socket] disconnected'); setConnected(false); });
    socket.on('connect_error', (err) => console.error('[Socket] connect error:', err.message));
    socketRef.current = socket;
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
