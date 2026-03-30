'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useReports, reportsApi } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, SearchInput,
  SkeletonTable, EmptyState, Tabs, Select,
} from '@/components/ui';
import { REPORT_STATUS_LABELS, formatDate } from '@/lib/utils';
import { FileText, RefreshCw, Download, Eye, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ReportsPage() {
  const router = useRouter();
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useReports({
    status: tab === 'all' ? undefined : tab,
    limit: 20, page,
  });

  const reports = (data as any)?.data?.data || [];
  const total   = (data as any)?.data?.total || 0;

  const downloadPdf = async (reportId: string, signed = false, reportNumber: string) => {
    try {
      const blob = await reportsApi.getPdf(reportId, signed);
      const url = URL.createObjectURL(blob as any);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportNumber}${signed ? '_IMZALI' : ''}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('PDF indirilemedi');
    }
  };

  const tabs = [
    { key: 'all',           label: 'Tümü' },
    { key: 'under_review',  label: 'İncelemede' },
    { key: 'approved',      label: 'Onaylı' },
    { key: 'signed',        label: 'İmzalı' },
    { key: 'delivered',     label: 'Teslim Edildi' },
  ];

  const filtered = reports.filter((r: any) =>
    !search ||
    r.reportNumber?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title="Raporlar"
        subtitle={`${total} rapor`}
        actions={
          <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>
            Yenile
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Tabs tabs={tabs} active={tab} onChange={(k) => { setTab(k); setPage(1); }} />
        <div className="ml-auto">
          <SearchInput value={search} onChange={setSearch} placeholder="Rapor no ara..." className="w-52" />
        </div>
      </div>

      <Card padding="none">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 skeleton rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<FileText className="w-12 h-12" />} title="Rapor bulunamadı" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Rapor No</th>
                <th>Form Rev.</th>
                <th>Oluşturma Tarihi</th>
                <th>İmzalanma</th>
                <th>Teslim</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: any) => {
                const s = REPORT_STATUS_LABELS[r.status] || { label: r.status, color: '' };
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                        {r.reportNumber}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded font-mono">
                        {r.formTemplateRevision}
                      </span>
                    </td>
                    <td><span className="text-sm text-slate-500">{formatDate(r.createdAt)}</span></td>
                    <td><span className="text-sm text-slate-500">{formatDate(r.signedAt)}</span></td>
                    <td><span className="text-sm text-slate-500">{formatDate(r.deliveredAt)}</span></td>
                    <td><Badge color={s.color} dot>{s.label}</Badge></td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {r.pdfUrl && (
                          <button
                            onClick={() => downloadPdf(r.id, false, r.reportNumber)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
                            title="Ham PDF"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                        {(r.status === 'signed' || r.status === 'delivered') && r.signedPdfUrl && (
                          <button
                            onClick={() => downloadPdf(r.id, true, r.reportNumber)}
                            className="p-1.5 rounded-lg hover:bg-green-50 text-slate-400 hover:text-green-600"
                            title="İmzalı PDF"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => router.push(`/reports/${r.id}`)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                          title="Detay"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {total > 20 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-sm text-slate-500">{total} rapordan {Math.min(page * 20, total)} gösteriliyor</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Önceki</Button>
              <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>Sonraki</Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
