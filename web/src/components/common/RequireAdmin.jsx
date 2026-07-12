import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Guard de rutas admin en el cliente: si no eres admin, redirige al lobby en
// vez de montar la página (el backend ya exige rol admin en /api/admin, esto es
// UX — evita cargar una pantalla que respondería 403).
export function RequireAdmin({ children }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}
