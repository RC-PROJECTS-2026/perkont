'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useMutationWithToast } from '@/lib/api';
import { PageHeader, Card, Badge, Button, SearchInput, SkeletonTable, EmptyState, Modal, Input, Select, Textarea, Tabs } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { FileText, Plus, RefreshCw, AlertTriangle, ExternalLink } from 'lucide-react';
import { useForm } from 'react-hook-form';

const TYPE_LABELS: Record<string, string> = { standard: 'Standart', regulation: 'Yönetmelik', procedure: 'Prosedür', form: 'Form', guideline: 'Kılavuz' };

export default function ReferenceDocsPage() {
  const [search, setSearch] = useState('');
  const [type, setType]     = useState('all');
  const [showCreate, setCreate] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['reference-docs', type, search],
    queryFn: () => apiClient.get(`/reference-docs?type=${type === 'all' ? '' : type}&search=${search}`),
  });
  const { data: dueData } = useQuery({ queryKey: ['docs-due'], queryFn: () => apiClient.get('/reference-docs/due-review?days=90') });

  const docs = (data as any)?.data?.data || [];
  const due  = (dueData as any)?.data || [];

  const { register, handleSubmit, reset } = useForm<any>();
  const createMutation = useMutationWithToast((d: any) => apiClient.post('/reference-docs', d),
    { successMessage: 'Doküman eklendi', invalidateKeys: [['reference-docs']], onSuccess: () => { setCreate(false); reset(); } });

  const tabs = ['all', 'standard', 'regulation', 'procedure', 'form', 'guideline'].map(k => ({ key: k, label: k === 'all' ? 'Tümü' : TYPE_LABELS[k] }));

  return (
    <>
      <PageHeader title="Referans Doküman Yönetimi" subtitle="Standartlar, yönetmelikler ve prosedür revizyonları"
        actions={<><Button variant="outline" icon={<RefreshCw className="w-4 h-4"/>} onClick={() => refetch()}>Yenile</Button><Button icon={<Plus className="w-4 h-4"/>} onClick={() => setCreate(true)}>Ekle</Button></>} />

      {due.length > 0 && (
        <div className="mb-4 flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{due.length} dokümanın gözden geçirme tarihi yaklaşıyor.</span>
        </div>
      )}

      <div className="mb-4 flex items-center gap-4">
        <Tabs tabs={tabs} active={type} onChange={setType} />
        <div className="ml-auto"><SearchInput value={search} onChange={setSearch} placeholder="Kod veya başlık ara..." className="w-56" /></div>
      </div>

      <Card padding="none">
        {isLoading ? <SkeletonTable rows={6} cols={5}/> : docs.length === 0 ? (
          <EmptyState icon={<FileText className="w-12 h-12"/>} title="Doküman bulunamadı" action={<Button icon={<Plus className="w-4 h-4"/>} onClick={() => setCreate(true)}>Ekle</Button>} />
        ) : (
          <table className="data-table">
            <thead><tr><th>Kod</th><th>Başlık</th><th>Revizyon</th><th>Tür</th><th>Gözden Geçirme</th><th>Durum</th><th></th></tr></thead>
            <tbody>
              {docs.map((d: any) => (
                <tr key={d.id}>
                  <td><span className="font-mono text-xs font-semibold">{d.code}</span></td>
                  <td><p className="text-sm font-medium text-slate-700 dark:text-slate-300 max-w-xs line-clamp-2">{d.title}</p></td>
                  <td><span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{d.revision}</span></td>
                  <td><Badge color="bg-slate-100 text-slate-600">{TYPE_LABELS[d.type] || d.type}</Badge></td>
                  <td>
                    {d.reviewDate ? (
                      <span className={`text-sm ${new Date(d.reviewDate) < new Date(Date.now() + 90 * 86400000) ? 'text-amber-600 font-semibold' : 'text-slate-500'}`}>
                        {formatDate(d.reviewDate)}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td><Badge color={d.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'} dot>{d.isActive ? 'Aktif' : 'Pasif'}</Badge></td>
                  <td>
                    {d.documentUrl && (
                      <a href={d.documentUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 block">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={showCreate} onClose={() => { setCreate(false); reset(); }} title="Referans Doküman Ekle" size="md"
        footer={<><Button variant="secondary" onClick={() => setCreate(false)}>İptal</Button><Button loading={createMutation.isPending} onClick={handleSubmit((d) => createMutation.mutate(d))}>Ekle</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Kod" required placeholder="TS EN 13157" {...register('code', { required: true })} />
          <Select label="Tür" options={Object.entries(TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))} {...register('type')} />
          <Input label="Başlık" required className="col-span-2" {...register('title', { required: true })} />
          <Input label="Revizyon" required placeholder="2022" {...register('revision', { required: true })} />
          <Input label="Gözden Geçirme Tarihi" type="date" {...register('reviewDate')} />
          <Textarea label="Notlar" {...register('notes')} className="col-span-2" rows={2} />
        </div>
      </Modal>
    </>
  );
}
