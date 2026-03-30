'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useMutationWithToast } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, StatCard, EmptyState,
  SkeletonTable, Modal, Input, Tabs,
} from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { Clock, CheckCircle2, AlertTriangle, RefreshCw, Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  at_risk: 'bg-amber-100 text-amber-700',
  breached: 'bg-red-100 text-red-700',
  met: 'bg-blue-100 text-blue-700',
};
const statusLabels: Record<string, string> = { active: 'Aktif', at_risk: 'Riskli', breached: 'İhlal', met: 'Tamamlandı' };

export default function SlaPage() {
  const [tab, setTab] = useState('dashboard');
  const [showCreate, setShowCreate] = useState(false);

  const { data: dashData, refetch: refetchDash } = useQuery({
    queryKey: ['sla-dashboard'],
    queryFn: () => apiClient.get('/sla/dashboard'),
  });
  const { data: breachData, isLoading: breachLoading } = useQuery({
    queryKey: ['sla-breaches'],
    queryFn: () => apiClient.get('/sla/breaches'),
  });
  const { data: defData, isLoading: defLoading, refetch: refetchDefs } = useQuery({
    queryKey: ['sla-definitions'],
    queryFn: () => apiClient.get('/sla/definitions'),
  });

  const dash = (dashData as any)?.data || {};
  const breaches = (breachData as any)?.data || [];
  const definitions = (defData as any)?.data?.data || (defData as any)?.data || [];

  const { register, handleSubmit, reset } = useForm<any>();

  const createMutation = useMutationWithToast(
    (d: any) => apiClient.post('/sla/definitions', d),
    {
      successMessage: 'SLA tanımı oluşturuldu',
      invalidateKeys: [['sla-definitions'], ['sla-dashboard']],
      onSuccess: () => { setShowCreate(false); reset(); },
    },
  );

  const tabs = [
    { key: 'dashboard',   label: 'Dashboard' },
    { key: 'definitions', label: 'Tanımlar', count: definitions.length },
    { key: 'breaches',    label: 'İhlaller', count: breaches.length },
  ];

  const handleRefetch = () => {
    refetchDash();
    refetchDefs();
  };

  return (
    <>
      <PageHeader
        title="SLA ve Termin Takibi"
        subtitle="Sözleşmede taahhüt edilen sürelerin otomatik izlenmesi"
        actions={
          <>
            <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={handleRefetch}>Yenile</Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>SLA Tanımı Ekle</Button>
          </>
        }
      />

      {/* Stats — always visible */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Uyumluluk Oranı" value={dash.complianceRate ? `%${dash.complianceRate}` : '—'}
          icon={<CheckCircle2 className="w-5 h-5 text-green-600" />} color="bg-green-50 dark:bg-green-950/40" />
        <StatCard label="Riskli" value={dash.atRisk || 0}
          icon={<AlertTriangle className="w-5 h-5 text-amber-600" />} color="bg-amber-50 dark:bg-amber-950/40" />
        <StatCard label="İhlal" value={dash.breached || 0}
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />} color="bg-red-50 dark:bg-red-950/40" />
        <StatCard label="Tamamlanan" value={dash.met || 0}
          icon={<Clock className="w-5 h-5 text-teal-600" />} color="bg-teal-50 dark:bg-teal-950/40" />
      </div>

      {/* Tabs */}
      <div className="mb-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      {/* ═══ Dashboard tab ═══ */}
      {tab === 'dashboard' && (
        <Card padding="none">
          {breachLoading ? <SkeletonTable rows={6} cols={6} /> : breaches.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="w-12 h-12" />} title="SLA ihlali veya riski yok" description="Tüm takip edilen metrikler normal" />
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Konu</th><th>Metrik</th><th>Başlangıç</th><th>Termin</th><th>Kalan</th><th>Durum</th></tr>
              </thead>
              <tbody>
                {breaches.map((t: any) => {
                  const days = t.daysRemaining;
                  return (
                    <tr key={t.id}>
                      <td><span className="text-xs text-slate-400 font-mono">{t.entityType}/{t.entityId?.slice(0, 8)}</span></td>
                      <td><span className="text-sm text-slate-600 dark:text-slate-400">{t.metricName?.replace(/_/g, ' ')}</span></td>
                      <td><span className="text-sm text-slate-500">{formatDate(t.startDate)}</span></td>
                      <td>
                        <span className={`text-sm font-semibold ${t.status === 'breached' ? 'text-red-600' : t.status === 'at_risk' ? 'text-amber-600' : 'text-slate-500'}`}>
                          {formatDate(t.dueDate)}
                        </span>
                      </td>
                      <td>
                        {days === null ? <span className="text-slate-300">—</span>
                          : days <= 0 ? <span className="text-xs font-bold text-red-600">{Math.abs(days)}g geçmiş</span>
                          : <span className="text-xs font-bold text-amber-600">{days}g kaldı</span>}
                      </td>
                      <td><Badge color={statusColors[t.status] || ''} dot>{statusLabels[t.status] || t.status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* ═══ Definitions tab ═══ */}
      {tab === 'definitions' && (
        <Card padding="none">
          {defLoading ? <SkeletonTable rows={4} cols={5} /> : definitions.length === 0 ? (
            <EmptyState icon={<Clock className="w-12 h-12" />} title="SLA tanımı yok"
              action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Ekle</Button>} />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tanım Adı</th>
                  <th>Rapor Teslim (gün)</th>
                  <th>Faturalama (gün)</th>
                  <th>Revizyon Yanıt (gün)</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {definitions.map((d: any) => (
                  <tr key={d.id}>
                    <td><span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{d.name}</span></td>
                    <td><span className="text-sm text-slate-600 dark:text-slate-400">{d.reportDeliveryDays ?? '—'}</span></td>
                    <td><span className="text-sm text-slate-600 dark:text-slate-400">{d.invoicingDays ?? '—'}</span></td>
                    <td><span className="text-sm text-slate-600 dark:text-slate-400">{d.revisionResponseDays ?? '—'}</span></td>
                    <td>
                      <Badge color={d.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'} dot>
                        {d.isActive !== false ? 'Aktif' : 'Pasif'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* ═══ Breaches tab ═══ */}
      {tab === 'breaches' && (
        <Card padding="none">
          {breachLoading ? <SkeletonTable rows={6} cols={6} /> : breaches.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="w-12 h-12" />} title="İhlal kaydı yok" description="Tüm SLA metrikleri karşılanıyor" />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Kayıt</th>
                  <th>Metrik</th>
                  <th>Başlangıç</th>
                  <th>Termin</th>
                  <th>Durum</th>
                  <th>Geçen Gün</th>
                </tr>
              </thead>
              <tbody>
                {breaches.filter((b: any) => b.status === 'breached' || b.status === 'at_risk').map((b: any) => {
                  const elapsed = b.daysElapsed ?? (b.daysRemaining !== null ? Math.abs(b.daysRemaining) : null);
                  return (
                    <tr key={b.id}>
                      <td><span className="text-xs text-slate-400 font-mono">{b.entityType}/{b.entityId?.slice(0, 8)}</span></td>
                      <td><span className="text-sm text-slate-600 dark:text-slate-400">{b.metricName?.replace(/_/g, ' ')}</span></td>
                      <td><span className="text-sm text-slate-500">{formatDate(b.startDate)}</span></td>
                      <td><span className={`text-sm font-semibold ${b.status === 'breached' ? 'text-red-600' : 'text-amber-600'}`}>{formatDate(b.dueDate)}</span></td>
                      <td><Badge color={statusColors[b.status] || ''} dot>{statusLabels[b.status] || b.status}</Badge></td>
                      <td>
                        {elapsed !== null
                          ? <span className="text-sm font-bold text-red-600">{elapsed}g</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* ═══ Create Definition Modal ═══ */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); reset(); }}
        title="Yeni SLA Tanımı"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowCreate(false); reset(); }}>İptal</Button>
            <Button loading={createMutation.isPending} onClick={handleSubmit((d) => createMutation.mutate(d))}>Kaydet</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Tanım Adı" required className="col-span-2" placeholder="Standart SLA" {...register('name', { required: true })} />
          <Input label="Rapor Teslim Süresi (gün)" type="number" min={1} {...register('reportDeliveryDays', { valueAsNumber: true })} />
          <Input label="Faturalama Süresi (gün)" type="number" min={1} {...register('invoicingDays', { valueAsNumber: true })} />
          <Input label="Revizyon Yanıt Süresi (gün)" type="number" min={1} {...register('revisionResponseDays', { valueAsNumber: true })} />
        </div>
      </Modal>
    </>
  );
}
