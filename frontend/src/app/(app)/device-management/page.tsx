'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useMutationWithToast } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, SearchInput,
  SkeletonTable, EmptyState, StatCard, Tabs, Modal, Textarea,
} from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { Smartphone, RefreshCw, ShieldOff, ChevronDown, ChevronRight } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-slate-100 text-slate-400',
  blocked: 'bg-red-100 text-red-700',
};
const STATUS_LABELS: Record<string, string> = {
  active: 'Aktif', inactive: 'Pasif', blocked: 'Blokeli',
};

export default function DeviceManagementPage() {
  const [tab, setTab]     = useState('active');
  const [search, setSearch] = useState('');
  const [blockModal, setBlockModal] = useState<any>(null);
  const [blockReason, setBlockReason] = useState('');
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['devices', tab, search],
    queryFn: () => apiClient.get('/device-management/devices', { params: { status: tab === 'all' ? undefined : tab, limit: 100 } }),
  });
  const { data: statsData } = useQuery({ queryKey: ['device-stats'], queryFn: () => apiClient.get('/device-management/stats') });

  const devices = (data as any)?.data?.data || [];
  const stats   = (statsData as any)?.data || {};

  const filtered = devices.filter((d: any) =>
    !search ||
    d.deviceName?.toLowerCase().includes(search.toLowerCase()) ||
    d.deviceModel?.toLowerCase().includes(search.toLowerCase()) ||
    d.userId?.toLowerCase().includes(search.toLowerCase()),
  );

  const blockMutation = useMutationWithToast(
    ({ id, reason }: any) => apiClient.patch(`/device-management/devices/${id}/block`, { reason }),
    {
      successMessage: 'Cihaz bloke edildi',
      invalidateKeys: [['devices'], ['device-stats']],
      onSuccess: () => { setBlockModal(null); setBlockReason(''); },
    },
  );

  // Device logs query (only when a device is expanded)
  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['device-logs', expandedDevice],
    queryFn: () => expandedDevice ? apiClient.get(`/device-management/logs/${expandedDevice}`) : Promise.resolve({ data: [] }),
    enabled: !!expandedDevice,
  });
  const deviceLogs = (logsData as any)?.data?.data || (logsData as any)?.data || [];

  const tabs = [
    { key: 'active', label: 'Aktif', count: stats.active || 0 },
    { key: 'blocked', label: 'Blokeli', count: stats.blocked || 0 },
    { key: 'all', label: 'Tümü', count: stats.total || 0 },
  ];

  const todayCount = devices.filter((d: any) => {
    if (!d.lastSeenAt) return false;
    const today = new Date();
    const seen = new Date(d.lastSeenAt);
    return seen.toDateString() === today.toDateString();
  }).length;

  return (
    <>
      <PageHeader title="Mobil Cihaz Yönetimi" subtitle="Kayıtlı cihazlar, versiyon dağılımı ve bloke yönetimi"
        actions={<Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Toplam Cihaz" value={stats.total || 0}
          icon={<Smartphone className="w-5 h-5 text-teal-600" />} color="bg-teal-50 dark:bg-teal-950/40" />
        <StatCard label="Aktif" value={stats.active || 0}
          icon={<Smartphone className="w-5 h-5 text-green-600" />} color="bg-green-50 dark:bg-green-950/40" />
        <StatCard label="Blokeli" value={stats.blocked || 0}
          icon={<ShieldOff className="w-5 h-5 text-red-600" />} color="bg-red-50 dark:bg-red-950/40" />
        <StatCard label="Bugün Görülen" value={todayCount}
          icon={<Smartphone className="w-5 h-5 text-slate-600" />} color="bg-slate-50 dark:bg-slate-800" />
      </div>

      <div className="mb-4 flex items-center gap-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        <div className="ml-auto"><SearchInput value={search} onChange={setSearch} placeholder="Cihaz, kullanıcı ara..." className="w-48" /></div>
      </div>

      <Card padding="none">
        {isLoading ? <SkeletonTable rows={6} cols={7} /> : filtered.length === 0 ? (
          <EmptyState icon={<Smartphone className="w-12 h-12" />} title="Cihaz bulunamadı" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-8"></th>
                <th>Cihaz ID</th>
                <th>Kullanıcı</th>
                <th>Platform / OS</th>
                <th>Uygulama Versiyonu</th>
                <th>Son Görüldü</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d: any) => {
                const isExpanded = expandedDevice === d.id;
                return (
                  <>
                    <tr key={d.id} className="cursor-pointer" onClick={() => setExpandedDevice(isExpanded ? null : d.id)}>
                      <td>
                        {isExpanded
                          ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                          : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                      </td>
                      <td>
                        <div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{d.deviceName || 'Bilinmiyor'}</p>
                          <p className="text-xs text-slate-400 font-mono">{d.deviceId?.slice(0, 16) || d.id?.slice(0, 12)}</p>
                        </div>
                      </td>
                      <td><span className="text-xs text-slate-400 font-mono">{d.userId?.slice(0, 8) || '—'}...</span></td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Badge color={d.platform === 'ios' ? 'bg-slate-100 text-slate-600' : 'bg-green-100 text-green-700'}>
                            {d.platform === 'ios' ? 'iOS' : 'Android'}
                          </Badge>
                          <span className="text-xs text-slate-400">{d.osVersion}</span>
                        </div>
                      </td>
                      <td>
                        <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                          {d.appVersion || '—'} {d.buildNumber ? `(${d.buildNumber})` : ''}
                        </span>
                      </td>
                      <td><span className="text-xs text-slate-500">{d.lastSeenAt ? formatDateTime(d.lastSeenAt) : '—'}</span></td>
                      <td><Badge color={STATUS_COLORS[d.status] || ''} dot>{STATUS_LABELS[d.status] || d.status}</Badge></td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {d.status !== 'blocked' && (
                          <button
                            onClick={() => setBlockModal(d)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"
                            title="Bloke Et"
                          >
                            <ShieldOff className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                    {/* Expanded device logs */}
                    {isExpanded && (
                      <tr key={`${d.id}-logs`}>
                        <td colSpan={8} className="!p-0">
                          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 border-y border-slate-100 dark:border-slate-700">
                            <h4 className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-2">Cihaz Logları</h4>
                            {logsLoading ? (
                              <p className="text-xs text-slate-400">Yükleniyor...</p>
                            ) : deviceLogs.length === 0 ? (
                              <p className="text-xs text-slate-400">Log kaydı bulunamadı</p>
                            ) : (
                              <div className="space-y-1 max-h-48 overflow-y-auto">
                                {deviceLogs.slice(0, 20).map((log: any, idx: number) => (
                                  <div key={idx} className="flex items-start gap-3 text-xs py-1">
                                    <span className="font-mono text-slate-400 whitespace-nowrap">{formatDateTime(log.timestamp || log.createdAt)}</span>
                                    <Badge color={log.level === 'error' ? 'bg-red-100 text-red-700' : log.level === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}>
                                      {log.level || log.action || 'info'}
                                    </Badge>
                                    <span className="text-slate-600 dark:text-slate-400">{log.message || log.description || JSON.stringify(log).slice(0, 80)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* Block Device Modal */}
      <Modal
        open={!!blockModal}
        onClose={() => { setBlockModal(null); setBlockReason(''); }}
        title={`Cihazı Bloke Et — ${blockModal?.deviceName || blockModal?.id?.slice(0, 12)}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBlockModal(null)}>İptal</Button>
            <Button
              loading={blockMutation.isPending}
              disabled={!blockReason.trim()}
              onClick={() => blockMutation.mutate({ id: blockModal?.id, reason: blockReason })}
              className="bg-red-600 hover:bg-red-700"
            >
              Bloke Et
            </Button>
          </>
        }
      >
        <Textarea
          label="Bloke Nedeni *"
          value={blockReason}
          onChange={(e) => setBlockReason(e.target.value)}
          placeholder="Güvenlik ihlali, kayıp cihaz, yetkisiz erişim..."
          rows={3}
        />
      </Modal>
    </>
  );
}
