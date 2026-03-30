'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useMutationWithToast } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, Tabs, StatCard,
  SkeletonTable, EmptyState, Modal, Input, Select, Textarea,
} from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { MessageSquare, Plus, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useForm } from 'react-hook-form';

const complaintsApi = {
  list:    (p?: any) => apiClient.get('/complaints', { params: p }),
  stats:   ()       => apiClient.get('/complaints/stats'),
  create:  (d: any)  => apiClient.post('/complaints', d),
  resolve: (id: string, resolution: string) => apiClient.patch(`/complaints/${id}/resolve`, { resolution }),
  close:   (id: string) => apiClient.patch(`/complaints/${id}/close`),
};

const statusColors: Record<string, string> = {
  received:             'bg-red-100 text-red-700',
  under_investigation:  'bg-amber-100 text-amber-700',
  resolved:             'bg-blue-100 text-blue-700',
  closed:               'bg-green-100 text-green-700',
};
const statusLabels: Record<string, string> = {
  received: 'Açık', under_investigation: 'İncelemede', resolved: 'Çözüldü', closed: 'Kapatıldı',
};

export default function ComplaintsPage() {
  const [tab, setTab]           = useState('received');
  const [showCreate, setShowCreate] = useState(false);
  const [resolveModal, setResolveModal] = useState<any>(null);
  const [resolution, setResolution]     = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['complaints', tab],
    queryFn: () => complaintsApi.list({ status: tab === 'all' ? undefined : tab, limit: 50 }),
  });
  const { data: statsData } = useQuery({
    queryKey: ['complaints-stats'],
    queryFn: complaintsApi.stats,
  });

  const items = (data as any)?.data?.data || [];
  const stats = (statsData as any)?.data || {};

  const { register, handleSubmit, reset } = useForm<any>();

  const createMutation = useMutationWithToast(complaintsApi.create, {
    successMessage: 'Kayıt oluşturuldu',
    invalidateKeys: [['complaints'], ['complaints-stats']],
    onSuccess: () => { setShowCreate(false); reset(); },
  });

  const resolveMutation = useMutationWithToast(
    ({ id, res }: any) => complaintsApi.resolve(id, res),
    {
      successMessage: 'Çözüme kavuşturuldu',
      invalidateKeys: [['complaints'], ['complaints-stats']],
      onSuccess: () => { setResolveModal(null); setResolution(''); },
    },
  );

  const closeMutation = useMutationWithToast(
    (id: string) => complaintsApi.close(id),
    { successMessage: 'Kapatıldı', invalidateKeys: [['complaints'], ['complaints-stats']] },
  );

  const tabs = [
    { key: 'received',            label: 'Açık',       count: stats.open || 0 },
    { key: 'under_investigation', label: 'İncelemede' },
    { key: 'resolved',            label: 'Çözüldü' },
    { key: 'closed',              label: 'Kapatıldı' },
    { key: 'all',                 label: 'Tümü' },
  ];

  return (
    <>
      <PageHeader
        title="Şikayet ve İtiraz Yönetimi"
        subtitle="ISO/IEC 17020 Madde 7.5"
        actions={
          <>
            <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Yeni Kayıt</Button>
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Toplam" value={stats.total || 0}
          icon={<MessageSquare className="w-5 h-5 text-slate-600" />} color="bg-slate-50 dark:bg-slate-800" />
        <StatCard label="Açık" value={stats.open || 0}
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />} color="bg-red-50 dark:bg-red-950/40" />
        <StatCard label="Gecikmiş" value={stats.overdue || 0}
          icon={<AlertTriangle className="w-5 h-5 text-amber-600" />} color="bg-amber-50 dark:bg-amber-950/40" />
      </div>

      <div className="mb-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      <Card padding="none">
        {isLoading ? <SkeletonTable rows={5} cols={7} /> : items.length === 0 ? (
          <EmptyState icon={<MessageSquare className="w-12 h-12" />} title="Kayıt bulunamadı"
            action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Yeni Kayıt</Button>} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Şikayet No</th>
                <th>Tip</th>
                <th>Müşteri</th>
                <th>Konu</th>
                <th>Hedef Tarih</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id}>
                  <td><span className="font-mono text-xs font-semibold">{item.complaintNumber}</span></td>
                  <td>
                    <Badge color={item.type === 'appeal' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}>
                      {item.type === 'appeal' ? 'İtiraz' : 'Şikayet'}
                    </Badge>
                  </td>
                  <td><span className="text-sm text-slate-500">{item.complainantName || '—'}</span></td>
                  <td>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 line-clamp-1 max-w-xs">
                      {item.subject}
                    </p>
                  </td>
                  <td>
                    {item.targetResolutionDate ? (
                      <span className={`text-sm ${new Date(item.targetResolutionDate) < new Date() && item.status !== 'closed' ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                        {formatDate(item.targetResolutionDate)}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td><Badge color={statusColors[item.status] || ''} dot>{statusLabels[item.status] || item.status}</Badge></td>
                  <td>
                    <div className="flex gap-1.5">
                      {item.status === 'under_investigation' && (
                        <button
                          onClick={() => setResolveModal(item)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600"
                          title="Çözüme Kavuştur"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                      {item.status === 'resolved' && (
                        <button
                          onClick={() => closeMutation.mutate(item.id)}
                          className="p-1.5 rounded-lg hover:bg-green-50 text-slate-400 hover:text-green-600"
                          title="Kapat"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
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
        title="Yeni Şikayet / İtiraz"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>İptal</Button>
            <Button loading={createMutation.isPending} onClick={handleSubmit((d) => createMutation.mutate(d))}>Kaydet</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Select label="Tür" required options={[{ value: 'complaint', label: 'Şikayet' }, { value: 'appeal', label: 'İtiraz' }]}
            {...register('type', { required: true })} />
          <Input label="Konu" required {...register('subject', { required: true })} />
          <Input label="Müşteri / Şikayetçi Adı" {...register('complainantName')} />
          <Input label="Şikayetçi E-posta" type="email" {...register('complainantEmail')} />
          <Input label="Şikayetçi Telefon" {...register('complainantPhone')} />
          <Input label="Hedef Çözüm Tarihi" type="date" {...register('targetResolutionDate')} />
          <Textarea label="Açıklama" required {...register('description', { required: true })} className="col-span-2" rows={4} />
        </div>
      </Modal>

      {/* Resolve Modal */}
      <Modal
        open={!!resolveModal}
        onClose={() => { setResolveModal(null); setResolution(''); }}
        title={`Çözüme Kavuştur — ${resolveModal?.complaintNumber}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResolveModal(null)}>İptal</Button>
            <Button
              loading={resolveMutation.isPending}
              disabled={!resolution.trim()}
              onClick={() => resolveMutation.mutate({ id: resolveModal?.id, res: resolution })}
            >
              Kaydet
            </Button>
          </>
        }
      >
        <Textarea
          label="Çözüm Açıklaması *"
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          placeholder="Yapılan işlem ve alınan karar..."
          rows={4}
        />
      </Modal>
    </>
  );
}
