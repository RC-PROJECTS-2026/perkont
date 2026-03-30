'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useInspections, inspectionsApi, useMutationWithToast } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, SearchInput,
  SkeletonTable, EmptyState, Tabs, Select,
} from '@/components/ui';
import { INSPECTION_STATUS_LABELS, formatDate, formatDateTime } from '@/lib/utils';
import { ClipboardList, RefreshCw, Eye, CheckCircle2, RotateCcw, Send } from 'lucide-react';
import toast from 'react-hot-toast';

export default function InspectionsPage() {
  const router = useRouter();
  const [tab, setTab] = useState('submitted');
  const [search, setSearch] = useState('');

  const { data, isLoading, refetch } = useInspections({ status: tab, limit: 50 });
  const inspections = (data as any)?.data?.data || [];

  const reviewMutation = useMutationWithToast(
    ({ id, action, note }: any) => inspectionsApi.review(id, action, note),
    {
      successMessage: 'İşlem tamamlandı',
      invalidateKeys: [['inspections'], ['reports']],
    },
  );

  const tabs = [
    { key: 'submitted',          label: 'Gönderildi' },
    { key: 'under_review',       label: 'İncelemede' },
    { key: 'revision_requested', label: 'Revizyon' },
    { key: 'approved',           label: 'Onaylı' },
    { key: 'in_progress',        label: 'Devam Ediyor' },
    { key: 'completed',          label: 'Tamamlandı' },
  ];

  const filtered = inspections.filter((i: any) =>
    !search || i.id?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title="Denetimler"
        subtitle="Tüm muayene denetimlerini yönetin"
        actions={
          <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>
            Yenile
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        <div className="ml-auto">
          <SearchInput value={search} onChange={setSearch} placeholder="Denetim ara..." className="w-56" />
        </div>
      </div>

      <Card padding="none">
        {isLoading ? (
          <SkeletonTable rows={8} cols={7} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="w-12 h-12" />}
            title="Bu durumda denetim yok"
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Denetim ID</th>
                <th>Ekipman</th>
                <th>Muayene Elemanı</th>
                <th>Form Revizyonu</th>
                <th>Sonuç</th>
                <th>Tarih</th>
                <th>Durum</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ins: any) => {
                const statusInfo = INSPECTION_STATUS_LABELS[ins.status] || { label: ins.status, color: '' };
                const resultColors: Record<string, string> = {
                  uygun:        'bg-green-100 text-green-700',
                  uygunsuz:     'bg-red-100 text-red-700',
                  kismi_uygun:  'bg-amber-100 text-amber-700',
                  uygulanamaz:  'bg-slate-100 text-slate-500',
                };
                const resultLabels: Record<string, string> = {
                  uygun: 'Uygun', uygunsuz: 'Uygunsuz',
                  kismi_uygun: 'Kısmi Uygun', uygulanamaz: 'Uygulanamaz',
                };

                return (
                  <tr key={ins.id}>
                    <td>
                      <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                        {ins.id?.slice(0, 8)}…
                      </span>
                    </td>
                    <td><span className="text-sm text-slate-600 dark:text-slate-400">{ins.equipmentId?.slice(0, 8)}…</span></td>
                    <td><span className="text-sm text-slate-600 dark:text-slate-400">{ins.inspectorId?.slice(0, 8)}…</span></td>
                    <td>
                      <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded font-mono">
                        {ins.formTemplateRevision}
                      </span>
                    </td>
                    <td>
                      {ins.overallResult ? (
                        <Badge color={resultColors[ins.overallResult] || ''}>
                          {resultLabels[ins.overallResult] || ins.overallResult}
                        </Badge>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td>
                      <span className="text-xs text-slate-500">{formatDate(ins.completedAt || ins.createdAt)}</span>
                    </td>
                    <td>
                      <Badge color={statusInfo.color} dot>{statusInfo.label}</Badge>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => router.push(`/inspections/${ins.id}`)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
                          title="Detay"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {(ins.status === 'submitted' || ins.status === 'under_review') && (
                          <>
                            <button
                              onClick={() => reviewMutation.mutate({ id: ins.id, action: 'approve', note: '' })}
                              className="p-1.5 rounded-lg hover:bg-green-50 text-slate-400 hover:text-green-600"
                              title="Onayla"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                const note = prompt('Revizyon notu:');
                                if (note) reviewMutation.mutate({ id: ins.id, action: 'request_revision', note });
                              }}
                              className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600"
                              title="Revizyon İste"
                            >
                              <RotateCcw className="w-4 h-4" />
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
    </>
  );
}
