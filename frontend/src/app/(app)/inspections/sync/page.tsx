'use client';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { PageHeader, Card, Badge, Button, StatCard, EmptyState } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { RefreshCw, Wifi, WifiOff, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

export default function SyncStatusPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['sync-status'],
    queryFn: () => apiClient.get('/sync/status'),
    refetchInterval: 15000,
  });

  const syncData = (data as any)?.data || {};
  const pending  = syncData.pendingCount || 0;
  const synced   = syncData.syncedCount  || 0;
  const conflict = syncData.conflictCount || 0;

  return (
    <>
      <PageHeader
        title="Senkronizasyon Durumu"
        subtitle="Offline kayıtların sunucu ile senkronizasyon durumu"
        actions={
          <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Bekleyen" value={pending}
          icon={<Clock className="w-5 h-5 text-amber-600" />}
          color={pending > 0 ? 'bg-amber-50 dark:bg-amber-950/40' : 'bg-slate-50 dark:bg-slate-800'} />
        <StatCard label="Senkronize" value={synced}
          icon={<CheckCircle2 className="w-5 h-5 text-green-600" />} color="bg-green-50 dark:bg-green-950/40" />
        <StatCard label="Çakışma" value={conflict}
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
          color={conflict > 0 ? 'bg-red-50 dark:bg-red-950/40' : 'bg-slate-50 dark:bg-slate-800'} />
        <StatCard label="Son Sync" value={syncData.lastSyncAt ? formatDateTime(syncData.lastSyncAt).split(' ')[1] : '—'}
          icon={<Wifi className="w-5 h-5 text-teal-600" />} color="bg-teal-50 dark:bg-teal-950/40" />
      </div>

      {pending > 0 && (
        <div className="mb-4 flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-300">
          <WifiOff className="w-4 h-4 flex-shrink-0" />
          <span>{pending} kayıt senkronize edilmeyi bekliyor. Cihaz internet bağlantısı olduğunda otomatik olarak senkronize edilecek.</span>
        </div>
      )}

      {conflict > 0 && (
        <div className="mb-4 flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{conflict} kayıtta çakışma var. Lütfen mobil uygulamadan çakışmaları çözün.</span>
        </div>
      )}

      <Card>
        {isLoading ? (
          <div className="h-32 skeleton rounded-xl" />
        ) : !syncData.recentActivity?.length ? (
          <EmptyState icon={<Wifi className="w-12 h-12" />} title="Sync geçmişi yok" description="Henüz senkronizasyon yapılmamış" />
        ) : (
          <div className="space-y-3">
            <p className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-4">Son Senkronizasyon Aktivitesi</p>
            {syncData.recentActivity.map((item: any, idx: number) => (
              <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${item.status === 'synced' ? 'bg-green-500' : item.status === 'pending' ? 'bg-amber-500' : 'bg-red-500'}`} />
                <div className="flex-1">
                  <p className="text-sm text-slate-700 dark:text-slate-300">{item.entityType} — <span className="font-mono text-xs">{item.entityId?.slice(0, 8)}</span></p>
                  <p className="text-xs text-slate-400">{formatDateTime(item.updatedAt)}</p>
                </div>
                <Badge color={item.status === 'synced' ? 'bg-green-100 text-green-700' : item.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}>
                  {item.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
