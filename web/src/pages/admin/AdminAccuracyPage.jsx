import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import api from '../../services/api';
import { AdminNav } from './AdminNav';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';

const chartConfig = {
  adivinado: { label: 'Adivinado', color: '#eab308' }, // dorado
  real: { label: 'Real', color: '#22c55e' },           // verde
};

export function AdminAccuracyPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/labels/accuracy').then(({ data }) => setData(data)).catch(() => setData([])).finally(() => setLoading(false));
  }, []);

  // KPIs globales sobre todos los testers
  const kpi = useMemo(() => {
    const total = data.reduce((a, t) => a + t.total, 0);
    const exactos = data.reduce((a, t) => a + t.exactos, 0);
    const cerca = data.reduce((a, t) => a + t.cerca, 0);
    const sumErr = data.reduce((a, t) => a + t.sumaError, 0);
    return {
      testers: data.length,
      total,
      pctExactos: total ? Math.round((exactos / total) * 100) : 0,
      pctCerca: total ? Math.round((cerca / total) * 100) : 0,
      errProm: total ? +(sumErr / total).toFixed(2) : 0,
    };
  }, [data]);

  return (
    <AdminNav>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-1">🎯 Precisión de los testers</h1>
        <p className="text-sm text-gray-400 mb-6">Qué tan bien adivina cada tester el nivel real de los bots que etiquetó.</p>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Testers', value: kpi.testers },
            { label: 'Etiquetas de nivel', value: kpi.total },
            { label: 'Aciertos exactos', value: `${kpi.pctExactos}%` },
            { label: 'Error promedio', value: `±${kpi.errProm}` },
          ].map(k => (
            <Card key={k.label}>
              <CardHeader className="pb-0">
                <CardDescription className="text-xs uppercase tracking-wider">{k.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-yellow-400">{k.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {loading ? <p className="text-gray-500">Cargando...</p> : data.length === 0 ? (
          <p className="text-gray-500 text-sm">Todavía no hay etiquetas de nivel. Pide a los testers que perfilen a los bots (nivel estimado) en la mesa.</p>
        ) : data.map((t, i) => {
          const chartData = t.detalle.map(d => ({ bot: d.bot.slice(0, 12), adivinado: d.adivinado, real: d.real }));
          return (
            <Card key={i} className="mb-5">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>{t.tester}</CardTitle>
                  <CardDescription>
                    {t.exactos} exactos · {t.cerca} cerca (±1) · error promedio ±{t.errorPromedio} · {t.total} etiquetas
                  </CardDescription>
                </div>
                <Badge variant={t.errorPromedio <= 1 ? 'default' : 'destructive'} className={t.errorPromedio <= 1 ? 'bg-green-800' : ''}>
                  {t.errorPromedio <= 0.5 ? 'Lector experto' : t.errorPromedio <= 1 ? 'Buen ojo' : 'Necesita práctica'}
                </Badge>
              </CardHeader>
              <CardContent>
                {/* Adivinado vs real por bot */}
                <ChartContainer config={chartConfig} className="h-[220px] w-full">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#374151" strokeDasharray="3 3" />
                    <XAxis dataKey="bot" tickLine={false} axisLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <YAxis domain={[0, 10]} tickLine={false} axisLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="adivinado" fill="var(--color-adivinado)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="real" fill="var(--color-real)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AdminNav>
  );
}
