import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable,
} from '@tanstack/react-table';
import api from '../../services/api';
import { AdminNav } from './AdminNav';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const LEVELS = [5, 6, 7, 8, 9, 10, 11, 12];

const LEVEL_COLORS = {
  5: 'bg-gray-700', 6: 'bg-sky-800', 7: 'bg-green-800',
  8: 'bg-yellow-700', 9: 'bg-orange-700', 10: 'bg-red-800',
  11: 'bg-purple-800', 12: 'bg-fuchsia-800',
};

// Tabla de bots activos: orden por columna + búsqueda (TanStack Table)
function ActiveBotsTable({ bots, tableNameOf }) {
  const [sorting, setSorting] = useState([{ id: 'level', desc: true }]);
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo(() => [
    {
      accessorKey: 'nickname',
      header: 'Bot',
      cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
    },
    {
      accessorKey: 'level',
      header: 'Nivel',
      cell: ({ getValue }) => (
        <Badge className={`${LEVEL_COLORS[getValue()] || 'bg-gray-700'} text-white`}>Nivel {getValue()}</Badge>
      ),
    },
    {
      accessorKey: 'tableId',
      header: 'Mesa',
      cell: ({ getValue }) => <span className="text-gray-400 text-xs">{tableNameOf(getValue())}</span>,
    },
  ], [tableNameOf]);

  const table = useReactTable({
    data: bots,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div>
      <Input
        placeholder="Buscar bot por nombre..."
        value={globalFilter}
        onChange={e => setGlobalFilter(e.target.value)}
        className="mb-2 max-w-xs"
      />
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(hg => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map(h => (
                  <TableHead
                    key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    className="cursor-pointer select-none text-gray-400"
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {{ asc: ' ↑', desc: ' ↓' }[h.column.getIsSorted()] ?? ''}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center text-gray-500 py-6">Sin bots activos.</TableCell></TableRow>
            ) : table.getRowModel().rows.map(row => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map(cell => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function AdminBotsPage() {
  const navigate = useNavigate();
  const [tables, setTables] = useState([]);
  const [tableId, setTableId] = useState('');
  const [level, setLevel] = useState(7);
  const [count, setCount] = useState(3);
  const [active, setActive] = useState([]);

  async function loadTables() {
    try { const { data } = await api.get('/tables'); setTables(data); if (!tableId && data[0]) setTableId(data[0].id); } catch {}
  }
  async function loadActive() {
    try { const { data } = await api.get('/admin/bots'); setActive(data); } catch {}
  }
  useEffect(() => { loadTables(); loadActive(); const t = setInterval(loadActive, 4000); return () => clearInterval(t); }, []);

  async function seat() {
    try {
      const { data } = await api.post('/admin/bots/seat', { tableId, level, count });
      toast.success(`${data.seated} bots nivel ${level} sentados`);
      loadActive();
    } catch (e) { toast.error(e.response?.data?.error || 'Error al sentar bots'); }
  }
  async function unseatTable() {
    try {
      const { data } = await api.post('/admin/bots/unseat', { tableId });
      toast.success(`${data.removed} bots retirados`);
      loadActive();
    } catch { toast.error('Error al retirar bots'); }
  }

  const atTable = active.filter(b => b.tableId === tableId);

  return (
    <AdminNav>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-1">🤖 Sentar bots</h1>
        <p className="text-sm text-gray-400 mb-6">Elige una mesa y llénala con bots del nivel que quieras. Los testers no verán el nivel.</p>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-5 space-y-4">
          <div>
            <label className="text-xs text-gray-400 uppercase font-bold">Mesa</label>
            <select value={tableId} onChange={e => setTableId(e.target.value)}
              className="w-full mt-1 bg-gray-800 rounded-lg px-3 py-2 text-sm">
              {tables.map(t => <option key={t.id} value={t.id}>{t.name} ({t.seated}/{t.maxSeats || t.max_seats})</option>)}
            </select>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs text-gray-400 uppercase font-bold">Nivel</label>
              <div className="flex gap-1 mt-1">
                {LEVELS.map(n => (
                  <button key={n} onClick={() => setLevel(n)}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold ${level === n ? 'bg-yellow-600 text-black' : 'bg-gray-800 text-gray-400'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-24">
              <label className="text-xs text-gray-400 uppercase font-bold">Cantidad</label>
              <input type="number" min={1} max={8} value={count} onChange={e => setCount(Number(e.target.value))}
                className="w-full mt-1 bg-gray-800 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={seat} className="flex-1 bg-green-700 hover:bg-green-600 font-bold py-2 rounded-lg">Sentar bots</button>
            <button onClick={unseatTable} className="bg-red-900 hover:bg-red-800 px-4 py-2 rounded-lg text-sm">Retirar todos de esta mesa</button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold">Bots activos ({active.length}) — {atTable.length} en esta mesa</h2>
          <button onClick={() => navigate(`/table/${tableId}?buyIn=300`)} className="text-xs text-sky-400 hover:text-sky-300">Abrir la mesa →</button>
        </div>
        <ActiveBotsTable
          bots={active}
          tableNameOf={(id) => tables.find(t => t.id === id)?.name || String(id).slice(0, 8)}
        />
      </div>
    </AdminNav>
  );
}
