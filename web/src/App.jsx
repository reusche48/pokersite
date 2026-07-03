import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { LobbyPage } from './pages/LobbyPage';
import { TablePage } from './pages/TablePage';
import { HistoryPage } from './pages/HistoryPage';
import { HandReplayPage } from './pages/HandReplayPage';

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LobbyPage />} />
            <Route path="/table/:id" element={<TablePage />} />
            <Route path="/historial" element={<HistoryPage />} />
            <Route path="/replay/:id" element={<HandReplayPage />} />
            <Route path="/replay/shared/:token" element={<HandReplayPage shared />} />
          </Routes>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}
