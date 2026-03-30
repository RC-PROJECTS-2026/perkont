'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { portalApi, reportsApi } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, SearchInput,
  SkeletonTable, EmptyState,
} from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { FileText, Download, Shield, ShieldCheck, Search } from 'lucide-react';
import toast from 'react-hot-toast';

const RESULT_BADGES: Record<string, { label: string; color: string }> = {
  suitable:   { label: 'Uygun',     color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  unsuitable: { label: 'Uygunsuz',  color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  partial:    { label: 'Kısmi',     color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
};

export default function PortalReportsPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['portal-reports'],
    queryFn: () => portalApi.getReports(),
  });

  const reports = (data as any)?.data || [];

  const filtered = reports.filter((r: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.reportNumber?.toLowerCase().includes(q) ||
      r.equipment?.inventoryCode?.toLowerCase().includes(q)
    );
  });

  const downloadPdf = async (reportId: string, reportNumber: string, signed = false) => {
    try {
      const blob = await reportsApi.getPdf(reportId, signed);
      const url = URL.createObjectURL(blob as any);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportNumber}${signed ? '_IMZALI' : ''}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Rapor indiriliyor');
    } catch {
      toast.error('PDF indirilemedi');
    }
  };

  const verifyReport = async (reportNumber: string) => {
    try {
      const res = await reportsApi.verify(reportNumber);
      const result = (res as any)?.data;
      if (result?.valid) {
        toast.success(`Rapor doğrulandı — ${reportNumber}`);
      } else {
        toast.error('Rapor doğrulanamadı');
      }
    } catch {
      toast.error('Doğrulama sırasında hata oluştu');
    }
  };

  return (
    <>
      <PageHeader
        title="Raporlarım"
        subtitle={`${reports.length} rapor`}
      />

      <Card padding="none">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Rapor numarası veya ekipman kodu ara..."
            className="max-w-sm"
          />
        </div>

        {isLoading ? (
          <SkeletonTable rows={6} cols={7} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-12 h-12" />}
            title="Rapor bulunamadı"
            description={search ? 'Arama kriterlerinizi değiştirin' : 'Tamamlanan denetim raporları burada görünecek'}
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Rapor No</th>
                <th>Ekipman</th>
                <th>Denetim Tarihi</th>
                <th>İmza Tarihi</th>
                <th>Teslim Tarihi</th>
                <th>Sonuç</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: any) => {
                const result = RESULT_BADGES[r.result] || RESULT_BADGES[r.overallResult] || null;
                const isSigned = r.status === 'signed' || r.status === 'delivered';

                return (
                  <tr key={r.id}>
                    <td>
                      <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                        {r.reportNumber}
                      </span>
                    </td>
                    <td>
                      <div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {r.equipment?.inventoryCode || r.inventoryCode || '—'}
                        </span>
                        {r.equipment?.equipmentType?.name && (
                          <p className="text-xs text-slate-400">{r.equipment.equipmentType.name}</p>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="text-sm text-slate-500">{formatDate(r.inspectionDate || r.createdAt)}</span>
                    </td>
                    <td>
                      <span className="text-sm text-slate-500">{formatDate(r.signedAt)}</span>
                    </td>
                    <td>
                      <span className="text-sm text-slate-500">{formatDate(r.deliveredAt)}</span>
                    </td>
                    <td>
                      {result ? (
                        <Badge color={result.color} dot>{result.label}</Badge>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {/* PDF İndir */}
                        {(r.pdfUrl || isSigned) && (
                          <button
                            onClick={() => downloadPdf(r.id, r.reportNumber, false)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-teal-600"
                            title="PDF İndir"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}

                        {/* İmzalı PDF */}
                        {isSigned && (
                          <button
                            onClick={() => downloadPdf(r.id, r.reportNumber, true)}
                            className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-950/30 text-slate-400 hover:text-green-600"
                            title="İmzalı PDF İndir"
                          >
                            <Shield className="w-4 h-4" />
                          </button>
                        )}

                        {/* Doğrula */}
                        {isSigned && (
                          <button
                            onClick={() => verifyReport(r.reportNumber)}
                            className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 text-slate-400 hover:text-blue-600"
                            title="Raporu Doğrula"
                          >
                            <ShieldCheck className="w-4 h-4" />
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
    </>
  );
}
