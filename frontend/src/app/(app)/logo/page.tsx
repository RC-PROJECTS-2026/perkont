'use client';
import { useState } from 'react';
import { useLogoQueue, logoApi, useMutationWithToast } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, Card, CardHeader, CardTitle, Badge, Button, Tabs, SkeletonTable, EmptyState, StatCard } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { Zap, RefreshCw, AlertTriangle, CheckCircle2, Clock, RotateCcw, Play } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LogoPage() {
  const [tab, setTab] = useState('failed');

  const { data, isLoading, refetch } = useLogoQueue({ status: tab, limit: 50 });
  const { data: statsData } = useQuery({
    queryKey: ['logo-stats'],
    queryFn: logoApi.getStats,
    refetchInterval: 15000,
  });

  const items = (data as any)?.data?.data || [];
  const stats = (statsData as any)?.data || {};

  const retryMutation = useMutationWithToast(logoApi.retryItem, {
    successMessage: 'Yeniden gönderim başlatıldı',
    invalidateKeys: [['logo-queue'], ['logo-stats']],
  });

  const retryAllMutation = useMutationWithToast(logoApi.retryAllFailed, {
    successMessage: 'Tüm başarısız kayıtlar kuyruğa alındı',
    invalidateKeys: [['logo-queue'], ['logo-stats']],
  });

  const statusColors: Record<string, string> = {
    pending:    'bg-amber-100 text-amber-700',
    processing: 'bg-blue-100 text-blue-700',
    success:    'bg-green-100 text-green-700',
    failed:     'bg-red-100 text-red-700',
    cancelled:  'bg-slate-100 text-slate-500',
  };

  const entityLabels: Record<string, string> = {
    customer:     'Cari Kart',
    invoice:      'Fatura',
    service_item: 'Hizmet Kartı',
  };

  const tabs = [
    { key: 'failed',     label: 'Başarısız',   count: stats.failed || 0 },
    { key: 'pending',    label: 'Bekliyor',    count: stats.pending || 0 },
    { key: 'processing', label: 'İşleniyor',   count: stats.processing || 0 },
    { key: 'success',    label: 'Başarılı' },
  ];

  return (
    <>
      <PageHeader
        title="LOGO Entegrasyon"
        subtitle="ERP senkronizasyon yönetimi"
        actions={
          <>
            <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>
              Yenile
            </Button>
            {tab === 'failed' && items.length > 0 && (
              <Button
                variant="danger"
                icon={<RotateCcw className="w-4 h-4" />}
                loading={retryAllMutation.isPending}
                onClick={() => retryAllMutation.mutate(undefined as any)}
              >
                Tümünü Yeniden Dene ({stats.failed || 0})
              </Button>
            )}
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Bekleyen"
          value={stats.pending || 0}
          icon={<Clock className="w-5 h-5 text-amber-600" />}
          color="bg-amber-50 dark:bg-amber-950/40"
        />
        <StatCard
          label="İşleniyor"
          value={stats.processing || 0}
          icon={<Zap className="w-5 h-5 text-blue-600" />}
          color="bg-blue-50 dark:bg-blue-950/40"
        />
        <StatCard
          label="Başarılı"
          value={stats.success || 0}
          icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
          color="bg-green-50 dark:bg-green-950/40"
        />
        <StatCard
          label="Başarısız"
          value={stats.failed || 0}
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
          color="bg-red-50 dark:bg-red-950/40"
        />
      </div>

      <div className="mb-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      <Card padding="none">
        {isLoading ? (
          <SkeletonTable rows={6} cols={7} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Zap className="w-12 h-12" />}
            title={`${tabs.find((t) => t.key === tab)?.label} kayıt yok`}
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Tür</th>
                <th>Entity ID</th>
                <th>Yön</th>
                <th>Deneme</th>
                <th>Son Hata</th>
                <th>Tarih</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id}>
                  <td>
                    <span className="text-xs font-semibold px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded">
                      {entityLabels[item.entityType] || item.entityType}
                    </span>
                  </td>
                  <td>
                    <span className="font-mono text-xs text-slate-500 truncate max-w-[120px] block">
                      {item.entityId?.slice(0, 8)}…
                    </span>
                  </td>
                  <td>
                    <span className="text-xs text-slate-500">{item.direction === 'push' ? '→ LOGO' : '← LOGO'}</span>
                  </td>
                  <td>
                    <span className={`text-sm font-semibold ${item.attemptCount >= 4 ? 'text-red-600' : 'text-slate-700 dark:text-slate-300'}`}>
                      {item.attemptCount} / 5
                    </span>
                  </td>
                  <td>
                    {item.lastError ? (
                      <span className="text-xs text-red-600 truncate max-w-[200px] block" title={item.lastError}>
                        {item.lastError.slice(0, 40)}{item.lastError.length > 40 ? '…' : ''}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td>
                    <span className="text-xs text-slate-500">{formatDateTime(item.createdAt)}</span>
                  </td>
                  <td>
                    <Badge color={statusColors[item.status] || ''}>
                      {item.status}
                    </Badge>
                  </td>
                  <td>
                    {(item.status === 'failed' || item.status === 'pending') && (
                      <button
                        onClick={() => retryMutation.mutate(item.id)}
                        disabled={retryMutation.isPending}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
                        title="Yeniden dene"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
