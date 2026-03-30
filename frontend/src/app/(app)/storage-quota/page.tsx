'use client';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { PageHeader, Card, Button, StatCard, SkeletonTable, EmptyState } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { HardDrive, RefreshCw, AlertTriangle, FileText } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const BUCKET_LABELS: Record<string, string> = {
  documents: 'Dokümanlar',
  photos: 'Fotoğraflar',
  reports: 'Raporlar',
  archive: 'Arşiv',
};
const BUCKET_ICONS: Record<string, string> = {
  documents: 'text-blue-600',
  photos: 'text-violet-600',
  reports: 'text-emerald-600',
  archive: 'text-amber-600',
};

function formatBytes(gb: number) {
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(gb * 1024).toFixed(0)} MB`;
}

export default function StorageQuotaPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['storage-summary'],
    queryFn: () => apiClient.get('/storage-quota/summary'),
  });
  const { data: historyData } = useQuery({
    queryKey: ['storage-history'],
    queryFn: () => apiClient.get('/storage-quota/history'),
  });
  const { data: largestData, isLoading: largestLoading } = useQuery({
    queryKey: ['storage-largest'],
    queryFn: () => apiClient.get('/storage-quota/largest'),
  });

  const summary = (data as any)?.data || {};
  const buckets = summary.buckets ? Object.entries(summary.buckets) : [];
  const history = (historyData as any)?.data || [];
  const largestFiles = (largestData as any)?.data || [];

  return (
    <>
      <PageHeader title="Depolama / Arşiv Kotası" subtitle="Bucket bazlı depolama kullanımı ve limitler"
        actions={<Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>} />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Toplam Kullanılan" value={summary.totalUsedGB ? formatBytes(summary.totalUsedGB) : '—'}
          icon={<HardDrive className="w-5 h-5 text-teal-600" />} color="bg-teal-50 dark:bg-teal-950/40" />
        <StatCard label="Toplam Kota" value={summary.totalQuotaGB ? formatBytes(summary.totalQuotaGB) : '—'}
          icon={<HardDrive className="w-5 h-5 text-slate-600" />} color="bg-slate-50 dark:bg-slate-800" />
        <StatCard label="Genel Doluluk" value={summary.overallPercent ? `%${summary.overallPercent}` : '—'}
          icon={<HardDrive className="w-5 h-5 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-950/40" />
        <StatCard label="Kritik Bucket" value={buckets.filter(([, b]: any) => (b as any).status === 'critical').length}
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />} color="bg-red-50 dark:bg-red-950/40" />
      </div>

      {/* Bucket Usage Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-40 skeleton rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {buckets.map(([key, b]: any) => (
            <Card key={key}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <HardDrive className={`w-4 h-4 ${BUCKET_ICONS[key] || 'text-slate-600'}`} />
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {BUCKET_LABELS[key] || key}
                  </span>
                </div>
                <span className={`text-sm font-bold ${b.status === 'critical' ? 'text-red-600' : b.status === 'warning' ? 'text-amber-600' : 'text-green-600'}`}>
                  %{b.usagePercent}
                </span>
              </div>
              <div className="mb-3">
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${b.status === 'critical' ? 'bg-red-500' : b.status === 'warning' ? 'bg-amber-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(b.usagePercent, 100)}%` }}
                  />
                </div>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>{formatBytes(b.usedGB)} kullanıldı</span>
                <span>{formatBytes(b.quotaGB)} limit</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">{b.fileCount?.toLocaleString('tr-TR')} dosya</p>
            </Card>
          ))}
        </div>
      )}

      {/* Usage History Chart */}
      {history.length > 0 && (
        <Card className="mb-6">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Kullanım Geçmişi</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(v) => {
                    const d = new Date(v);
                    return `${d.getDate()}/${d.getMonth() + 1}`;
                  }}
                />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} unit=" GB" />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12, color: '#e2e8f0' }}
                  labelFormatter={(v) => formatDate(v)}
                  formatter={(value: any) => [`${value} GB`, 'Kullanım']}
                />
                <Line type="monotone" dataKey="usedGB" stroke="#6366f1" strokeWidth={2} dot={false} />
                {history[0]?.quotaGB && (
                  <Line type="monotone" dataKey="quotaGB" stroke="#e2e8f0" strokeWidth={1} strokeDasharray="5 5" dot={false} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Largest Files Table */}
      <Card padding="none">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">En Büyük Dosyalar</h3>
        </div>
        {largestLoading ? <SkeletonTable rows={5} cols={5} /> : largestFiles.length === 0 ? (
          <EmptyState icon={<FileText className="w-12 h-12" />} title="Dosya bulunamadı" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Dosya Adı</th>
                <th>Bucket</th>
                <th>Boyut</th>
                <th>Tür</th>
                <th>Yüklenme Tarihi</th>
              </tr>
            </thead>
            <tbody>
              {largestFiles.map((f: any, idx: number) => (
                <tr key={f.id || idx}>
                  <td>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="text-sm text-slate-700 dark:text-slate-300 truncate max-w-xs">{f.fileName || f.key}</span>
                    </div>
                  </td>
                  <td><span className="text-xs text-slate-500">{BUCKET_LABELS[f.bucket] || f.bucket}</span></td>
                  <td>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      {f.sizeBytes ? `${(f.sizeBytes / (1024 * 1024)).toFixed(1)} MB` : f.sizeMB ? `${f.sizeMB} MB` : '—'}
                    </span>
                  </td>
                  <td><span className="text-xs text-slate-400">{f.contentType || f.mimeType || '—'}</span></td>
                  <td><span className="text-sm text-slate-500">{formatDate(f.uploadedAt || f.createdAt)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
