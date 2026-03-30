'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useMutationWithToast } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, Tabs,
  SkeletonTable, EmptyState, Modal, Input, Select, Textarea, StatCard,
} from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { AlertTriangle, Plus, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useForm } from 'react-hook-form';

const capaApi = {
  list:  (p?: any) => apiClient.get('/capa', { params: p }),
  stats: ()        => apiClient.get('/capa/stats'),
  create:(d: any)  => apiClient.post('/capa', d),
  update:(id: string, d: any) => apiClient.put(`/capa/${id}`, d),
  close: (id: string, result: string) => apiClient.patch(`/capa/${id}/close`, { effectivenessResult: result }),
};

const typeLabels: Record<string, string> = { corrective: 'Düzeltici', preventive: 'Önleyici' };
const statusColors: Record<string, string> = {
  open:                 'bg-red-100 text-red-700',
  in_progress:          'bg-amber-100 text-amber-700',
  effectiveness_check:  'bg-blue-100 text-blue-700',
  closed:               'bg-green-100 text-green-700',
};
const statusLabels: Record<string, string> = {
  open: 'Açık', in_progress: 'Devam', effectiveness_check: 'Etkinlik Kontrolü', closed: 'Kapatıldı',
};
const sevColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  major:    'bg-orange-100 text-orange-700',
  minor:    'bg-amber-100 text-amber-700',
};

export default function CapaPage() {
  const [tab, setTab]           = useState('open');
  const [showCreate, setShowCreate] = useState(false);
  const [closeModal, setCloseModal] = useState<any>(null);
  const [closeResult, setCloseResult] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['capa', tab],
    queryFn: () => capaApi.list({ status: tab === 'all' ? undefined : tab, limit: 50 }),
  });
  const { data: statsData } = useQuery({ queryKey: ['capa-stats'], queryFn: capaApi.stats });

  const items = (data as any)?.data?.data || [];
  const stats = (statsData as any)?.data || {};

  const { register, handleSubmit, reset } = useForm<any>();

  const createMutation = useMutationWithToast(capaApi.create, {
    successMessage: 'CAPA kaydı oluşturuldu',
    invalidateKeys: [['capa'], ['capa-stats']],
    onSuccess: () => { setShowCreate(false); reset(); },
  });

  const closeMutation = useMutationWithToast(
    ({ id, result }: any) => capaApi.close(id, result),
    {
      successMessage: 'CAPA kapatıldı',
      invalidateKeys: [['capa'], ['capa-stats']],
      onSuccess: () => { setCloseModal(null); setCloseResult(''); },
    },
  );

  const tabs = [
    { key: 'open',                label: 'Açık',           count: stats.open || 0 },
    { key: 'in_progress',         label: 'Devam Ediyor' },
    { key: 'effectiveness_check', label: 'Etkinlik Kontrolü' },
    { key: 'closed',              label: 'Kapatılmış' },
    { key: 'all',                 label: 'Tümü' },
  ];

  return (
    <>
      <PageHeader
        title="CAPA Kayıtları"
        subtitle="Düzeltici ve Önleyici Faaliyetler — ISO/IEC 17020 Madde 8.5"
        actions={
          <>
            <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>CAPA Oluştur</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Toplam" value={stats.total || 0}
          icon={<AlertTriangle className="w-5 h-5 text-slate-600" />} color="bg-slate-50" />
        <StatCard label="Açık" value={stats.open || 0}
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />} color="bg-red-50 dark:bg-red-950/40" />
        <StatCard label="Gecikmiş" value={stats.overdue || 0}
          icon={<AlertTriangle className="w-5 h-5 text-amber-600" />} color="bg-amber-50 dark:bg-amber-950/40" />
        <StatCard label="Kapatılmış" value={(stats.byStatus || []).find((s: any) => s.status === 'closed')?.count || 0}
          icon={<CheckCircle2 className="w-5 h-5 text-green-600" />} color="bg-green-50 dark:bg-green-950/40" />
      </div>

      <div className="mb-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      <Card padding="none">
        {isLoading ? <SkeletonTable rows={6} cols={7} /> : items.length === 0 ? (
          <EmptyState
            icon={<AlertTriangle className="w-12 h-12" />}
            title="CAPA kaydı yok"
            action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Oluştur</Button>}
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>CAPA No</th>
                <th>Tür</th>
                <th>Şiddet</th>
                <th>Açıklama</th>
                <th>Hedef Tarih</th>
                <th>Sorumlu</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id}>
                  <td><span className="font-mono text-xs font-semibold">{item.capaNumber}</span></td>
                  <td><Badge color="bg-slate-100 text-slate-600">{typeLabels[item.type] || item.type}</Badge></td>
                  <td><Badge color={sevColors[item.severity] || ''}>{item.severity}</Badge></td>
                  <td>
                    <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2 max-w-xs">
                      {item.nonconformityDescription}
                    </p>
                  </td>
                  <td>
                    {item.targetDate ? (
                      <span className={`text-sm ${new Date(item.targetDate) < new Date() && item.status !== 'closed' ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                        {formatDate(item.targetDate)}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td><span className="text-xs text-slate-400">{item.assignedToId?.slice(0, 8) || '—'}</span></td>
                  <td><Badge color={statusColors[item.status] || ''} dot>{statusLabels[item.status] || item.status}</Badge></td>
                  <td>
                    {item.status === 'effectiveness_check' && (
                      <button
                        onClick={() => setCloseModal(item)}
                        className="p-1.5 rounded-lg hover:bg-green-50 text-slate-400 hover:text-green-600"
                        title="Kapat"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); reset(); }}
        title="Yeni CAPA Kaydı"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowCreate(false); reset(); }}>İptal</Button>
            <Button loading={createMutation.isPending} onClick={handleSubmit((d) => createMutation.mutate(d))}>Kaydet</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Select label="Tür" required options={[{ value: 'corrective', label: 'Düzeltici' }, { value: 'preventive', label: 'Önleyici' }]}
            {...register('type', { required: true })} />
          <Select label="Şiddet" required options={[{ value: 'critical', label: 'Kritik' }, { value: 'major', label: 'Önemli' }, { value: 'minor', label: 'Küçük' }]}
            {...register('severity', { required: true })} />
          <Textarea label="Uygunsuzluk Açıklaması" required {...register('nonconformityDescription', { required: true })} className="col-span-2" rows={3} />
          <Textarea label="Kök Neden Analizi" {...register('rootCauseAnalysis')} className="col-span-2" rows={2} />
          <Textarea label="Planlanan Faaliyet" {...register('proposedAction')} className="col-span-2" rows={2} />
          <Input label="Hedef Tarih" type="date" {...register('targetDate')} />
          <Input label="Kaynak Tür" placeholder="inspection / audit / complaint" {...register('sourceType')} />
        </div>
      </Modal>

      {/* Close Modal */}
      <Modal
        open={!!closeModal}
        onClose={() => { setCloseModal(null); setCloseResult(''); }}
        title={`CAPA Kapat — ${closeModal?.capaNumber}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCloseModal(null)}>İptal</Button>
            <Button
              loading={closeMutation.isPending}
              disabled={!closeResult.trim()}
              onClick={() => closeMutation.mutate({ id: closeModal?.id, result: closeResult })}
            >
              Kapat
            </Button>
          </>
        }
      >
        <Textarea
          label="Etkinlik Değerlendirme Sonucu *"
          value={closeResult}
          onChange={(e) => setCloseResult(e.target.value)}
          placeholder="Alınan faaliyet etkili olmuş mudur? Açıklayınız..."
          rows={4}
        />
      </Modal>
    </>
  );
}
