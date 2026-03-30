'use client';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { PageHeader, Card, Badge, Button, StatCard, EmptyState } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { Award, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function CertificatesPage() {
  const router = useRouter();

  const { data: expiring, isLoading, refetch } = useQuery({
    queryKey: ['expiring-qualifications'],
    queryFn: () => apiClient.get('/users/expiring-qualifications?days=60'),
  });

  const { data: expired } = useQuery({
    queryKey: ['expired-qualifications'],
    queryFn: () => apiClient.get('/users/expiring-qualifications?days=0'),
  });

  const expiringList = (expiring as any)?.data || [];
  const expiredList  = (expired as any)?.data?.filter((q: any) => new Date(q.expiryDate) < new Date()) || [];

  const critical = expiringList.filter((q: any) => {
    const days = Math.ceil((new Date(q.expiryDate).getTime() - Date.now()) / 86400000);
    return days <= 14;
  });

  return (
    <>
      <PageHeader
        title="Sertifika Takip Paneli"
        subtitle="Yakında dolacak ve süresi dolmuş yetkinlikler"
        actions={
          <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Süresi Dolmuş" value={expiredList.length}
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />} color="bg-red-50 dark:bg-red-950/40" />
        <StatCard label="14 Günde Dolacak" value={critical.length}
          icon={<AlertTriangle className="w-5 h-5 text-amber-600" />} color="bg-amber-50 dark:bg-amber-950/40" />
        <StatCard label="60 Günde Dolacak" value={expiringList.length}
          icon={<Award className="w-5 h-5 text-yellow-600" />} color="bg-yellow-50 dark:bg-yellow-950/40" />
        <StatCard label="Toplam Personel" value={[...new Set([...expiringList, ...expiredList].map((q: any) => q.userId))].length}
          icon={<Award className="w-5 h-5 text-slate-600" />} color="bg-slate-50 dark:bg-slate-800" />
      </div>

      {expiredList.length > 0 && (
        <div className="mb-6">
          <h2 className="font-bold text-sm text-red-600 uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Süresi Dolmuş
          </h2>
          <QualTable items={expiredList} status="expired" router={router} />
        </div>
      )}

      <div>
        <h2 className="font-bold text-sm text-amber-600 uppercase tracking-wider mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> 60 Gün İçinde Dolacak
        </h2>
        {isLoading ? (
          <div className="h-40 skeleton rounded-xl" />
        ) : expiringList.length === 0 ? (
          <Card><EmptyState icon={<Award className="w-12 h-12" />} title="Yakında dolacak sertifika yok" description="Tüm sertifikalar geçerli" /></Card>
        ) : (
          <QualTable items={expiringList} status="expiring_soon" router={router} />
        )}
      </div>
    </>
  );
}

function QualTable({ items, status, router }: { items: any[]; status: string; router: any }) {
  const statusColor = status === 'expired' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
  const statusLabel = status === 'expired' ? 'Süresi Doldu' : 'Yakında Dolacak';

  return (
    <Card padding="none">
      <table className="data-table">
        <thead>
          <tr>
            <th>Personel</th>
            <th>Sertifika</th>
            <th>Veren</th>
            <th>Son Geçerlilik</th>
            <th>Kalan</th>
            <th>Durum</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((q: any) => {
            const days = Math.ceil((new Date(q.expiryDate).getTime() - Date.now()) / 86400000);
            return (
              <tr key={q.id}>
                <td>
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{q.user?.fullName || '—'}</p>
                    <p className="text-xs text-slate-400">{q.user?.email}</p>
                  </div>
                </td>
                <td><span className="text-sm font-medium text-slate-700 dark:text-slate-300">{q.certificateName}</span></td>
                <td><span className="text-sm text-slate-500">{q.issuer || '—'}</span></td>
                <td>
                  <span className={`text-sm font-semibold ${days <= 0 ? 'text-red-600' : days <= 14 ? 'text-amber-600' : 'text-slate-500'}`}>
                    {formatDate(q.expiryDate)}
                  </span>
                </td>
                <td>
                  {days <= 0
                    ? <span className="text-xs font-bold text-red-600">{Math.abs(days)}g geçmiş</span>
                    : <span className="text-xs font-bold text-amber-600">{days}g kaldı</span>
                  }
                </td>
                <td><Badge color={statusColor}>{statusLabel}</Badge></td>
                <td>
                  <button onClick={() => router.push(`/users/${q.userId}`)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
