import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from 'sonner';

// Aviso de "versión nueva disponible". Con registerType:'prompt', el Service
// Worker NO se actualiza solo: detecta la versión nueva y aquí mostramos un
// toast persistente. Al tocar "Actualizar", aplica el SW nuevo y recarga.
// Así el usuario nunca se queda con la versión vieja sin enterarse.
export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(err) { console.error('[PWA] error al registrar SW:', err); },
  });

  useEffect(() => {
    if (!needRefresh) return;
    toast('✨ Hay una versión nueva', {
      description: 'Toca para actualizar y ver lo último.',
      duration: Infinity,
      action: {
        label: 'Actualizar',
        onClick: () => updateServiceWorker(true), // aplica SW nuevo + recarga
      },
    });
  }, [needRefresh, updateServiceWorker]);

  return null;
}
