import { toast } from 'sonner';

// Identificador corto de una partida: T-142 (torneo) / M-37 (mesa).
// El id real es un UUID imposible de dictar; este código sí se puede leer en
// una captura, decir por teléfono o buscar en la BD (WHERE seq = 142).
// Al pulsarlo se copia al portapapeles.
export function GameCode({ seq, kind = 'T', className = '' }) {
  if (seq === null || seq === undefined) return null;
  const code = `${kind}-${seq}`;
  return (
    <button
      type="button"
      title="Copiar el identificador de esta partida"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(code);
        toast.success(`📋 ${code} copiado`);
      }}
      className={`font-mono text-[11px] px-1.5 py-0.5 rounded bg-gray-900/70 text-gray-400 border border-gray-700 hover:text-white hover:border-gray-500 transition-colors ${className}`}
    >
      {code}
    </button>
  );
}
