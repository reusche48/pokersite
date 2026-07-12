import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { RequireAdmin } from './components/common/RequireAdmin';
import { LobbyPage } from './pages/LobbyPage';
import { TablePage } from './pages/TablePage';
import { HistoryPage } from './pages/HistoryPage';
import { StatsPage } from './pages/StatsPage';
import { ProfilePage } from './pages/ProfilePage';
import { HandReplayPage } from './pages/HandReplayPage';
import { ClubPage } from './pages/ClubPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminBotsPage } from './pages/admin/AdminBotsPage';
import { AdminTournamentsPage } from './pages/admin/AdminTournamentsPage';
import { AdminAccuracyPage } from './pages/admin/AdminAccuracyPage';
import { AdminSecurityPage } from './pages/admin/AdminSecurityPage';
// Carga diferida: el código 3D (three.js, ~880 KB) solo se descarga al abrir la
// mesa 3D — un teléfono de gama baja que nunca la abre no lo descarga jamás.
const Table3DDemoPage = lazy(() => import('./pages/Table3DDemoPage').then(m => ({ default: m.Table3DDemoPage })));
const Table25DDemoPage = lazy(() => import('./pages/Table25DDemoPage').then(m => ({ default: m.Table25DDemoPage })));

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <SocketProvider>
        <Toaster theme="dark" position="top-center" richColors closeButton />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LobbyPage />} />
            <Route path="/table/:id" element={<TablePage />} />
            <Route path="/historial" element={<HistoryPage />} />
            <Route path="/estadisticas" element={<StatsPage />} />
            <Route path="/perfil" element={<ProfilePage />} />
            <Route path="/club/:id" element={<ClubPage />} />
            <Route path="/replay/:id" element={<HandReplayPage />} />
            <Route path="/demo3d" element={
              <Suspense fallback={<div className="min-h-screen bg-gray-950 text-white flex items-center justify-center text-sm text-gray-400">Cargando mesa 3D…</div>}>
                <Table3DDemoPage />
              </Suspense>
            } />
            <Route path="/demo25d" element={
              <Suspense fallback={<div className="min-h-screen bg-gray-950 text-white flex items-center justify-center text-sm text-gray-400">Cargando mesa…</div>}>
                <Table25DDemoPage />
              </Suspense>
            } />
            <Route path="/replay/shared/:token" element={<HandReplayPage shared />} />
            <Route path="/admin" element={<RequireAdmin><AdminDashboardPage /></RequireAdmin>} />
            <Route path="/admin/bots" element={<RequireAdmin><AdminBotsPage /></RequireAdmin>} />
            <Route path="/admin/torneos" element={<RequireAdmin><AdminTournamentsPage /></RequireAdmin>} />
            <Route path="/admin/precision" element={<RequireAdmin><AdminAccuracyPage /></RequireAdmin>} />
            <Route path="/admin/seguridad" element={<RequireAdmin><AdminSecurityPage /></RequireAdmin>} />
          </Routes>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
    </ErrorBoundary>
  );
}
