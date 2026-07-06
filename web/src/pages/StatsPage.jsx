import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import api from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

const netConfig = { net: { label: 'Ganancia neta', color: '#22c55e' } };
const handsConfig = { hands: { label: 'Manos', color: '#eab308' } };

export function StatsPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/players/me/stats')
      .then(({ data }) => setStats(data))
      .catch(() => setError('No se pudieron cargar tus estadísticas'));
  }, []);

  if (error) {
    return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">{error}</div>;
  }
  if (!stats) {
    return <div className="min-h-screen bg-gray-950 text-green-200 flex items-center justify-center animate-pulse">♠ Cargando estadísticas...</div>;
  }

  // Serie acumulada para la curva de ganancia
  let acc = 0;
  const cumSeries = stats.series.map(d => { acc += d.net; return { ...d, net: acc }; });
  const netPositive = stats.net >= 0;

  const KPIS = [
    { label: 'Manos jugadas', value: stats.totalHands },
    { label: 'Manos ganadas', value: stats.wins },
    { label: 'Winrate', value: `${stats.winRate}%` },
    { label: 'Ganancia neta', value: `${netPositive ? '+' : ''}${stats.net.toLocaleString()}`, color: netPositive ? 'text-green-400' : 'text-red-400' },
    { label: 'Mejor bote ganado', value: stats.bestWin.toLocaleString() },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white lobby-bg">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-white">← Lobby</button>
        <h1 className="text-xl font-bold">📈 Mis estadísticas</h1>
        <button onClick={() => navigate('/historial')} className="text-xs text-sky-400 hover:text-sky-300 font-bold">📜 Ver manos</button>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {stats.totalHands === 0 ? (
          <p className="text-center text-gray-500 py-20">Todavía no has jugado ninguna mano. ¡Entra a una mesa!</p>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              {KPIS.map(k => (
                <Card key={k.label}>
                  <CardHeader className="pb-0">
                    <CardDescription className="text-[10px] uppercase tracking-wider">{k.label}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${k.color || 'text-yellow-400'}`}>{k.value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Curva de ganancia acumulada */}
            <Card className="mb-5">
              <CardHeader>
                <CardTitle className="text-base">Ganancia acumulada</CardTitle>
                <CardDescription>Evolución de tus fichas ganadas menos apostadas, por día</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={netConfig} className="h-[240px] w-full">
                  <AreaChart data={cumSeries} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="netFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#374151" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area type="monotone" dataKey="net" stroke="#22c55e" strokeWidth={2} fill="url(#netFill)" />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Manos por día */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Actividad</CardTitle>
                <CardDescription>Manos jugadas por día</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={handsConfig} className="h-[180px] w-full">
                  <BarChart data={stats.series} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#374151" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="hands" fill="var(--color-hands)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
