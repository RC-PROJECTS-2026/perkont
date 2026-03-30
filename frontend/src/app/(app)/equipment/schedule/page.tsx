'use client';
import { useQuery } from '@tanstack/react-query';
import { Calendar, AlertTriangle, Clock } from 'lucide-react';
import { equipmentApi } from '@/lib/api';
import { PageHeader, Card, StatCard, Badge } from '@/components/ui';
import { formatDate } from '@/lib/utils';

export default function EquipmentSchedulePage() {
  const { data: due, isLoading: dueLoading } = useQuery({ queryKey: ['equipment-due'], queryFn: () => equipmentApi.getDueControls(90) });
  const { data: overdue, isLoading: overdueLoading } = useQuery({ queryKey: ['equipment-overdue'], queryFn: equipmentApi.getOverdue });

  const dueList = (due as any)?.data || due || [];
  const overdueList = (overdue as any)?.data || overdue || [];

  return (
    <div>
      <PageHeader title="Kontrol Takvimi" subtitle="Yaklaşan ve gecikmiş periyodik kontroller" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <StatCard title="Gecikmiş Kontroller" value={overdueList.length} icon={<AlertTriangle className="w-5 h-5 text-red-500" />} />
        <StatCard title="90 Gün İçinde" value={dueList.length} icon={<Clock className="w-5 h-5 text-amber-500" />} />
      </div>

      {overdueList.length > 0 && (
        <Card className="mb-6">
          <h3 className="font-bold text-red-600 mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Gecikmiş Kontroller</h3>
          <table className="data-table">
            <thead><tr><th>Envanter Kodu</th><th>Ekipman Tipi</th><th>Müşteri</th><th>Son Kontrol</th><th>Planlanan Tarih</th></tr></thead>
            <tbody>
              {overdueList.map((eq: any) => (
                <tr key={eq.id}>
                  <td className="font-mono text-sm font-semibold">{eq.inventoryCode}</td>
                  <td>{eq.equipmentType?.name || '—'}</td>
                  <td>{eq.customer?.name || '—'}</td>
                  <td>{eq.lastControlDate ? formatDate(eq.lastControlDate) : '—'}</td>
                  <td><span className="text-red-600 font-semibold">{eq.nextControlDate ? formatDate(eq.nextControlDate) : '—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card>
        <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2"><Calendar className="w-4 h-4" /> Yaklaşan Kontroller (90 Gün)</h3>
        {dueLoading ? <div className="animate-pulse h-40 bg-slate-100 dark:bg-slate-800 rounded" /> : (
          <table className="data-table">
            <thead><tr><th>Envanter Kodu</th><th>Ekipman Tipi</th><th>Müşteri</th><th>Sonraki Kontrol</th><th>Kalan Gün</th></tr></thead>
            <tbody>
              {dueList.map((eq: any) => {
                const days = Math.ceil((new Date(eq.nextControlDate).getTime() - Date.now()) / 86400000);
                return (
                  <tr key={eq.id}>
                    <td className="font-mono text-sm font-semibold">{eq.inventoryCode}</td>
                    <td>{eq.equipmentType?.name || '—'}</td>
                    <td>{eq.customer?.name || '—'}</td>
                    <td>{formatDate(eq.nextControlDate)}</td>
                    <td><Badge color={days <= 7 ? 'bg-red-100 text-red-700' : days <= 30 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}>{days} gün</Badge></td>
                  </tr>
                );
              })}
              {dueList.length === 0 && <tr><td colSpan={5} className="text-center text-slate-500 py-8">Yaklaşan kontrol yok</td></tr>}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
