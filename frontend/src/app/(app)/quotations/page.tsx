'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useMutationWithToast } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, SearchInput,
  SkeletonTable, EmptyState, Tabs, Modal, Input, Select, Textarea, StatCard,
} from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { FileText, Plus, RefreshCw, Send, CheckCircle2, XCircle, Eye } from 'lucide-react';
import { useForm } from 'react-hook-form';

const quotationsApi = {
  list:   (p?: any)         => apiClient.get('/quotations', { params: p }),
  create: (d: any)          => apiClient.post('/quotations', d),
  send:   (id: string)      => apiClient.patch(`/quotations/${id}/send`),
  accept: (id: string)      => apiClient.patch(`/quotations/${id}/accept`),
  reject: (id: string, r: string) => apiClient.patch(`/quotations/${id}/reject`, { reason: r }),
};

const statusColors: Record<string, string> = {
  draft:    'bg-slate-100 text-slate-500',
  sent:     'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  expired:  'bg-amber-100 text-amber-700',
};
const statusLabels: Record<string, string> = {
  draft: 'Taslak', sent: 'Gönderildi', accepted: 'Kabul Edildi',
  rejected: 'Reddedildi', expired: 'Süresi Doldu',
};

export default function QuotationsPage() {
  const router   = useRouter();
  const [tab, setTab] = useState('draft');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [rejectModal, setRejectModal] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['quotations', tab, search],
    queryFn: () => quotationsApi.list({ status: tab === 'all' ? undefined : tab, limit: 50 }),
  });
  const quotations = (data as any)?.data?.data || [];
  const totalValue = quotations.reduce((s: number, q: any) => s + (Number(q.totalAmount) || 0), 0);

  const { register, handleSubmit, reset, watch, setValue } = useForm<any>({
    defaultValues: { currency: 'TRY', discountRate: 0, items: [{ description: '', quantity: 1, unitPrice: 0 }] },
  });

  const createMutation = useMutationWithToast(quotationsApi.create, {
    successMessage: 'Teklif oluşturuldu',
    invalidateKeys: [['quotations']],
    onSuccess: () => { setShowCreate(false); reset(); },
  });
  const sendMutation = useMutationWithToast(
    (id: string) => quotationsApi.send(id),
    { successMessage: 'Teklif gönderildi', invalidateKeys: [['quotations']] },
  );
  const acceptMutation = useMutationWithToast(
    (id: string) => quotationsApi.accept(id),
    { successMessage: 'Teklif kabul edildi', invalidateKeys: [['quotations']] },
  );
  const rejectMutation = useMutationWithToast(
    ({ id, reason }: any) => quotationsApi.reject(id, reason),
    { successMessage: 'Teklif reddedildi', invalidateKeys: [['quotations']], onSuccess: () => { setRejectModal(null); setRejectReason(''); } },
  );

  const tabs = [
    { key: 'draft',    label: 'Taslak' },
    { key: 'sent',     label: 'Gönderildi' },
    { key: 'accepted', label: 'Kabul' },
    { key: 'rejected', label: 'Red' },
    { key: 'all',      label: 'Tümü' },
  ];

  const filtered = quotations.filter((q: any) =>
    !search || q.quoteNumber?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title="Teklifler"
        subtitle={`${filtered.length} teklif`}
        actions={
          <>
            <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Teklif Oluştur</Button>
          </>
        }
      />

      {tab !== 'all' && totalValue > 0 && (
        <div className="mb-4">
          <StatCard
            label={`${statusLabels[tab] || tab} Tekliflerin Toplam Tutarı`}
            value={`₺${totalValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
            icon={<FileText className="w-5 h-5 text-teal-600" />}
            color="bg-teal-50 dark:bg-teal-950/40"
            className="max-w-sm"
          />
        </div>
      )}

      <div className="mb-4 flex items-center gap-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        <div className="ml-auto">
          <SearchInput value={search} onChange={setSearch} placeholder="Teklif no ara..." className="w-48" />
        </div>
      </div>

      <Card padding="none">
        {isLoading ? <SkeletonTable rows={6} cols={6} /> : filtered.length === 0 ? (
          <EmptyState icon={<FileText className="w-12 h-12" />} title="Teklif bulunamadı"
            action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Oluştur</Button>} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Teklif No</th>
                <th>Müşteri</th>
                <th>Geçerlilik</th>
                <th>Toplam</th>
                <th>Kalem</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((q: any) => {
                const isExpired = q.validUntil && new Date(q.validUntil) < new Date() && q.status === 'sent';
                return (
                  <tr key={q.id}>
                    <td><span className="font-mono text-xs font-semibold">{q.quoteNumber}</span></td>
                    <td><span className="text-sm text-slate-600 dark:text-slate-400">{q.customerId?.slice(0, 8)}…</span></td>
                    <td>
                      <span className={`text-sm ${isExpired ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                        {formatDate(q.validUntil)}
                      </span>
                    </td>
                    <td>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {Number(q.totalAmount) > 0 ? `₺${Number(q.totalAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '—'}
                      </span>
                    </td>
                    <td><span className="text-sm font-medium text-slate-600 dark:text-slate-400">{q.items?.length || 0}</span></td>
                    <td>
                      <Badge color={statusColors[q.status] || ''} dot>
                        {isExpired ? 'Süresi Doldu' : statusLabels[q.status] || q.status}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <button className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                          <Eye className="w-4 h-4" />
                        </button>
                        {q.status === 'draft' && (
                          <button onClick={() => sendMutation.mutate(q.id)}
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600" title="Gönder">
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        {q.status === 'sent' && (
                          <>
                            <button onClick={() => acceptMutation.mutate(q.id)}
                              className="p-1.5 rounded-lg hover:bg-green-50 text-slate-400 hover:text-green-600" title="Kabul Et">
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => setRejectModal(q)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600" title="Reddet">
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); }} title="Yeni Teklif Oluştur" size="xl"
        footer={<>
          <Button variant="secondary" onClick={() => setShowCreate(false)}>İptal</Button>
          <Button loading={createMutation.isPending} onClick={handleSubmit((d) => createMutation.mutate(d))}>Kaydet</Button>
        </>}>
        <div className="grid grid-cols-3 gap-4">
          <Input label="Müşteri ID" required className="col-span-2" {...register('customerId', { required: true })} />
          <Input label="Geçerlilik Tarihi" type="date" {...register('validUntil')} />
          <Select label="Para Birimi" options={[{ value: 'TRY', label: '₺ TRY' }, { value: 'USD', label: '$ USD' }, { value: 'EUR', label: '€ EUR' }]}
            {...register('currency')} />
          <Input label="İndirim %" type="number" min={0} max={100} {...register('discountRate', { valueAsNumber: true })} />
          <Textarea label="Notlar" {...register('notes')} className="col-span-3" rows={2} />
          <p className="col-span-3 text-xs text-slate-400">Kalemler teklif oluşturulduktan sonra detay sayfasından eklenebilir.</p>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal open={!!rejectModal} onClose={() => { setRejectModal(null); setRejectReason(''); }} title={`Teklifi Reddet — ${rejectModal?.quoteNumber}`} size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setRejectModal(null)}>İptal</Button>
          <Button variant="danger" loading={rejectMutation.isPending} disabled={!rejectReason.trim()}
            onClick={() => rejectMutation.mutate({ id: rejectModal?.id, reason: rejectReason })}>
            Reddet
          </Button>
        </>}>
        <Textarea label="Red Gerekçesi *" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} />
      </Modal>
    </>
  );
}
