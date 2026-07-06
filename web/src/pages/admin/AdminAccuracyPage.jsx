import { useEffect, useState } from 'react';
import api from '../../services/api';
import { AdminNav } from './AdminNav';

export function AdminAccuracyPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/labels/accuracy').then(({ data }) => setData(data)).catch(() => setData([])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <AdminNav />
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-1">🎯 Precisión de los testers</h1>
        <p className="text-sm text-gray-400 mb-6">Qué tan bien adivina cada tester el nivel real de los bots que etiquetó.</p>

        {loading ? <p className="text-gray-500">Cargando...</p> : data.length === 0 ? (
          <p className="text-gray-500 text-sm">Todavía no hay etiquetas de nivel. Pide a los testers que perfilen a los bots (nivel estimado) en la mesa.</p>
        ) : data.map((t, i) => (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold">{t.tester}</h2>
              <div className="text-xs text-gray-400">
                <span className="text-green-400 font-bold">{t.exactos}</span> exactos ·
                <span className="text-yellow-400 font-bold"> {t.cerca}</span> cerca (±1) ·
                error promedio <span className="font-bold">{t.errorPromedio}</span> · de {t.total}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs text-left">
                  <th className="pb-1">Bot</th><th className="pb-1">Adivinó</th><th className="pb-1">Real</th><th className="pb-1">Error</th>
                </tr>
              </thead>
              <tbody>
                {t.detalle.map((d, j) => (
                  <tr key={j} className="border-t border-gray-800">
                    <td className="py-1">{d.bot}</td>
                    <td className="py-1 font-mono">{d.adivinado}</td>
                    <td className="py-1 font-mono">{d.real}</td>
                    <td className={`py-1 font-bold ${d.error === 0 ? 'text-green-400' : d.error === 1 ? 'text-yellow-400' : 'text-red-400'}`}>{d.error === 0 ? '✓' : `±${d.error}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
