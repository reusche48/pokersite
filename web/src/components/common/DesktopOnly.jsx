import { Navigate } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useIsMobile';

// Guard para pantallas SOLO de escritorio (mesas 3D/2.5D). En móvil redirige al
// lobby antes de montar el componente, así el bundle de three.js ni se carga y
// el celular no se recalienta con el bucle de render continuo.
export function DesktopOnly({ children }) {
  const isMobile = useIsMobile();
  if (isMobile) return <Navigate to="/" replace />;
  return children;
}
