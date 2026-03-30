'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useMutationWithToast } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, SearchInput,
  SkeletonTable, EmptyState, Tabs, Modal, Input, Select, Textarea,
} from '@/components/ui';
import { formatDate, isExpiringSoon } from '@/lib/utils';
import { Briefcase, Plus, RefreshCw, Upload, CheckCircle2, AlertTriangle, Eye } from 'lucide-react';
import { useForm } from 'react-hook-form';

const contractsApi = {
  list:       (p?: any)     => apiClient.get('/contracts', { params: p }),
  expiring:   (days = 60)   => apiClient.get('/contracts/expiring', { params: { days } }),
  create:     (d: any)      => apiClient.post('/contracts', d),
  sign:       (id: string, party: string) => apiClient.patch(`/contracts/${id}/sign/${party}`),
};

const statusColors: Record<string, string> = {
  draft:      'bg-slate-100 text-slate-500',
  sent:       'bg-blue-100 text-blue-700',
  signed:     'bg-emerald-100 text-emerald-700',
  active:     'bg-green-100 text-green-700',
  expired:    'bg-amber-100 text-amber-700',
  terminated: 'bg-red-100 text-red-700',
};
const statusLabels: Record<string, string> = {
  draft: 'Taslak', sent: 'Gönderildi', signed: 'İmzalandı',
  active: 'Aktif', expired: 'Süresi Doldu', terminated: 'Sonlandırıldı',
};

export default function ContractsPage() {
  const [tab, setTab]             = useState('active');
  const [search, setSearch]       = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [uploadModal, setUploadModal] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['contracts', tab, search],
    queryFn: () => contractsApi.list({ status: tab === 'all' ? undefined : tab, limit: 50 }),
  });
  const { data: expiringData } = useQuery({
    queryKey: ['contracts-expiring'],
    queryFn: () => contractsApi.expiring(60),
  });

  const contracts = (data as any)?.data?.data || [];
  const expiring  = (expiringData as any)?.data || [];

  const { register, handleSubmit, reset } = useForm<any>();

  const createMutation = useMutationWithToast(contractsApi.create, {
    successMessage: 'Sözleşme oluşturuldu',
    invalidateKeys: [['contracts']],
    onSuccess: () => { setShowCreate(false); reset(); },
  });

  const signMutation = useMutationWithToast(
    ({ id, party }: any) => contractsApi.sign(id, party),
    { successMessage: 'İmza kaydedildi', invalidateKeys: [['contracts']] },
  );

  const uploadMutation = useMutationWithToast(
    ({ id, file }: any) => {
      const fd = new FormData(); fd.append('file', file);
      return apiClient.post(`/contracts/${id}/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    { successMessage: 'Belge yüklendi', invalidateKeys: [['contracts']], onSuccess: () => { setUploadModal(null); setSelectedFile(null); } },
  );

  const tabs = [
    { key: 'draft',   label: 'Taslak' },
    { key: 'active',  label: 'Aktif' },
    { key: 'signed',  label: 'İmzalı' },
    { key: 'expired', label: 'Süresi Dolan' },
    { key: 'all',     label: 'Tümü' },
  ];

  const filtered = contracts.filter((c: any) =>
    !search || c.contractNumber?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title="Sözleşmeler"
        subtitle={`${filtered.length} sözleşme`}
        actions={
          <>
            <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Sözleşme Oluştur</Button>
          </>
        }
      />

      {expiring.length > 0 && (
        <div className="mb-4 flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{expiring.length} sözleşmenin geçerlilik süresi 60 gün içinde dolacak.</span>
        </div>
      )}

      <div className="mb-4 flex items-center gap-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        <div className="ml-auto">
          <SearchInput value={search} onChange={setSearch} placeholder="Sözleşme no ara..." className="w-48" />
        </div>
      </div>

      <Card padding="none">
        {isLoading ? <SkeletonTable rows={6} cols={7} /> : filtered.length === 0 ? (
          <EmptyState icon={<Briefcase className="w-12 h-12" />} title="Sözleşme bulunamadı"
            action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Oluştur</Button>} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Sözleşme No</th>
                <th>Müşteri</th>
                <th>Başlangıç</th>
                <th>Bitiş</th>
                <th>Tutar</th>
                <th>Belge</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: any) => {
                const daysToEnd = c.endDate
                  ? Math.ceil((new Date(c.endDate).getTime() - Date.now()) / 86400000)
                  : null;
                const isNearExpiry = daysToEnd !== null && daysToEnd > 0 && daysToEnd <= 60;
                return (
                  <tr key={c.id}>
                    <td><span className="font-mono text-xs font-semibold">{c.contractNumber}</span></td>
                    <td><span className="text-sm text-slate-600 dark:text-slate-400">{c.customerId?.slice(0, 8)}…</span></td>
                    <td><span className="text-sm text-slate-500">{formatDate(c.startDate)}</span></td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {isNearExpiry && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                        <span className={`text-sm ${isNearExpiry ? 'text-amber-600 font-medium' : 'text-slate-500'}`}>
                          {formatDate(c.endDate)}
                        </span>
                        {isNearExpiry && <span className="text-xs text-amber-500">{daysToEnd}g</span>}
                      </div>
                    </td>
                    <td>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {c.totalValue ? `₺${Number(c.totalValue).toLocaleString('tr-TR')}` : '—'}
                      </span>
                    </td>
                    <td>
                      {c.documentUrl ? (
                        <Badge color="bg-green-100 text-green-700">Yüklendi</Badge>
                      ) : (
                        <Badge color="bg-slate-100 text-slate-400">Yok</Badge>
                      )}
                    </td>
                    <td><Badge color={statusColors[c.status] || ''} dot>{statusLabels[c.status] || c.status}</Badge></td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <button className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => setUploadModal(c)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600" title="Belge Yükle">
                          <Upload className="w-4 h-4" />
                        </button>
                        {c.status === 'sent' && !c.companySignedAt && (
                          <button onClick={() => signMutation.mutate({ id: c.id, party: 'company' })}
                            className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600" title="Firma İmzası">
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
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
      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); }} title="Yeni Sözleşme" size="md"
        footer={<>
          <Button variant="secondary" onClick={() => setShowCreate(false)}>İptal</Button>
          <Button loading={createMutation.isPending} onClick={handleSubmit((d) => createMutation.mutate(d))}>Kaydet</Button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Müşteri ID" required className="col-span-2" {...register('customerId', { required: true })} />
          <Input label="Başlangıç Tarihi" type="date" {...register('startDate')} />
          <Input label="Bitiş Tarihi" type="date" {...register('endDate')} />
          <Input label="Toplam Tutar" type="number" {...register('totalValue', { valueAsNumber: true })} />
          <Select label="Para Birimi" options={[{ value: 'TRY', label: '₺ TRY' }, { value: 'USD', label: '$ USD' }, { value: 'EUR', label: '€ EUR' }]}
            {...register('currency')} />
          <Select label="Otomatik Yenileme" options={[{ value: 'false', label: 'Hayır' }, { value: 'true', label: 'Evet' }]}
            {...register('autoRenew')} className="col-span-2" />
          <Textarea label="Notlar" {...register('notes')} className="col-span-2" rows={2} />
        </div>
      </Modal>

      {/* Upload Modal */}
      <Modal open={!!uploadModal} onClose={() => { setUploadModal(null); setSelectedFile(null); }}
        title={`Sözleşme Belgesi — ${uploadModal?.contractNumber}`} size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setUploadModal(null)}>İptal</Button>
          <Button loading={uploadMutation.isPending} disabled={!selectedFile}
            onClick={() => uploadMutation.mutate({ id: uploadModal?.id, file: selectedFile })}>
            Yükle
          </Button>
        </>}>
        <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-teal-400 transition-colors"
          onClick={() => document.getElementById('contract-upload')?.click()}>
          <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          {selectedFile
            ? <p className="text-sm font-semibold text-teal-600">{selectedFile.name}</p>
            : <p className="text-sm text-slate-500">PDF belgeyi seçin</p>
          }
          <input id="contract-upload" type="file" accept=".pdf" className="hidden"
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
        </div>
      </Modal>
    </>
  );
}
