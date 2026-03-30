'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useMutationWithToast } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, SearchInput,
  SkeletonTable, EmptyState, Modal, Input, Select, Textarea, Tabs,
} from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { Users, Plus, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useForm } from 'react-hook-form';

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  passive: 'bg-slate-100 text-slate-500',
  blacklisted: 'bg-red-100 text-red-700',
};
const statusLabels: Record<string, string> = { active: 'Aktif', passive: 'Pasif', blacklisted: 'Kara Listede' };

export default function SubcontractorsPage() {
  const [tab, setTab] = useState('active');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['subcontractors', tab, search],
    queryFn: () => apiClient.get('/subcontractors', { params: { status: tab === 'all' ? undefined : tab, search: search || undefined } }),
  });
  const { data: expiring } = useQuery({
    queryKey: ['subcontractors-expiring'],
    queryFn: () => apiClient.get('/subcontractors/expiring-contracts'),
  });
  const { data: assignmentsData } = useQuery({
    queryKey: ['subcontractor-assignments-recent'],
    queryFn: () => apiClient.get('/subcontractors/assignments', { params: { limit: 5 } }),
  });

  const items     = (data as any)?.data?.data || [];
  const expiringC = (expiring as any)?.data || [];
  const recentAssignments = (assignmentsData as any)?.data?.data || (assignmentsData as any)?.data || [];

  const { register, handleSubmit, reset } = useForm<any>();

  const createMutation = useMutationWithToast(
    (d: any) => apiClient.post('/subcontractors', d),
    { successMessage: 'Taşeron eklendi', invalidateKeys: [['subcontractors']], onSuccess: () => { setShowCreate(false); reset(); } },
  );

  const tabs = [
    { key: 'active', label: 'Aktif' },
    { key: 'passive', label: 'Pasif' },
    { key: 'blacklisted', label: 'Kara Liste' },
    { key: 'all', label: 'Tümü' },
  ];

  return (
    <>
      <PageHeader title="Dış Temin / Taşeron Yönetimi" subtitle="ISO/IEC 17020 — Dışarıdan temin edilen hizmetler"
        actions={<>
          <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Taşeron Ekle</Button>
        </>} />

      {expiringC.length > 0 && (
        <div className="mb-4 flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{expiringC.length} taşeronun sözleşmesi yakında dolacak.</span>
        </div>
      )}

      <div className="mb-4 flex items-center gap-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        <div className="ml-auto"><SearchInput value={search} onChange={setSearch} placeholder="Ad, vergi no ara..." className="w-48" /></div>
      </div>

      <Card padding="none">
        {isLoading ? <SkeletonTable rows={5} cols={6} /> : items.length === 0 ? (
          <EmptyState icon={<Users className="w-12 h-12" />} title="Taşeron bulunamadı"
            action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Ekle</Button>} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Ad</th>
                <th>Tip</th>
                <th>Vergi No</th>
                <th>İletişim</th>
                <th>Sözleşme Tarihleri</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s: any) => (
                <tr key={s.id}>
                  <td><p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{s.name}</p></td>
                  <td><Badge color="bg-slate-100 text-slate-500">{s.type === 'company' ? 'Firma' : 'Bireysel'}</Badge></td>
                  <td><span className="font-mono text-xs text-slate-500">{s.taxNumber || '—'}</span></td>
                  <td>
                    <div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">{s.contactName || '—'}</p>
                      {s.contactPhone && <p className="text-xs text-slate-400 font-mono">{s.contactPhone}</p>}
                      {s.contactEmail && <p className="text-xs text-slate-400">{s.contactEmail}</p>}
                    </div>
                  </td>
                  <td>
                    <div>
                      {s.contractStart && (
                        <span className="text-sm text-slate-500">{formatDate(s.contractStart)}</span>
                      )}
                      {s.contractStart && s.contractEnd && <span className="text-slate-400 mx-1">—</span>}
                      {s.contractEnd ? (
                        <span className={`text-sm ${new Date(s.contractEnd) < new Date(Date.now() + 60 * 86400000) ? 'text-amber-600 font-semibold' : 'text-slate-500'}`}>
                          {formatDate(s.contractEnd)}
                        </span>
                      ) : !s.contractStart ? <span className="text-slate-300">—</span> : null}
                    </div>
                  </td>
                  <td><Badge color={statusColors[s.status] || ''} dot>{statusLabels[s.status] || s.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Recent Assignments */}
      {recentAssignments.length > 0 && (
        <Card className="mt-6">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Son Görevlendirmeler</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Taşeron</th>
                <th>İş Emri</th>
                <th>Atanma Tarihi</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {recentAssignments.map((a: any) => (
                <tr key={a.id}>
                  <td><span className="text-sm text-slate-600 dark:text-slate-400">{a.subcontractor?.name || a.subcontractorId?.slice(0, 8)}</span></td>
                  <td><span className="font-mono text-xs text-slate-500">{a.workOrderId?.slice(0, 8) || '—'}</span></td>
                  <td><span className="text-sm text-slate-500">{formatDate(a.assignedAt || a.createdAt)}</span></td>
                  <td>
                    <Badge color={a.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'} dot>
                      {a.status === 'completed' ? 'Tamamlandı' : 'Devam'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); }} title="Yeni Taşeron" size="md"
        footer={<>
          <Button variant="secondary" onClick={() => setShowCreate(false)}>İptal</Button>
          <Button loading={createMutation.isPending} onClick={handleSubmit((d) => createMutation.mutate(d))}>Ekle</Button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Ad / Firma Adı" required className="col-span-2" {...register('name', { required: true })} />
          <Select label="Tür" options={[{ value: 'company', label: 'Firma' }, { value: 'person', label: 'Bireysel' }]} {...register('type')} />
          <Input label="Vergi No" {...register('taxNumber')} />
          <Input label="İrtibat Kişisi" {...register('contactName')} />
          <Input label="İrtibat Telefonu" {...register('contactPhone')} />
          <Input label="İrtibat E-posta" type="email" {...register('contactEmail')} />
          <Input label="Şehir" {...register('city')} />
          <Input label="Sözleşme Başlangıç" type="date" {...register('contractStart')} />
          <Input label="Sözleşme Bitiş" type="date" {...register('contractEnd')} />
          <Textarea label="Notlar" {...register('notes')} className="col-span-2" rows={2} />
        </div>
      </Modal>
    </>
  );
}
