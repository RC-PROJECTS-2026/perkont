'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditApi } from '@/lib/api';
import { PageHeader, Card, Badge, Button, Input, Select, SkeletonTable, EmptyState } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { Activity, RefreshCw, Shield, ChevronDown, ChevronRight, User } from 'lucide-react';

const ACTION_COLORS: Record<string, string> = {
  USER_LOGIN:              'bg-blue-100 text-blue-700',
  USER_LOGOUT:             'bg-slate-100 text-slate-500',
  INSPECTION_STARTED:      'bg-violet-100 text-violet-700',
  INSPECTION_COMPLETED:    'bg-emerald-100 text-emerald-700',
  INSPECTION_APPROVED:     'bg-green-100 text-green-700',
  REPORT_CREATED:          'bg-teal-100 text-teal-700',
  REPORT_SIGNED:           'bg-green-100 text-green-700',
  REPORT_DELIVERED:        'bg-teal-100 text-teal-700',
  LOGO_SYNC_SUCCESS:       'bg-green-100 text-green-700',
  LOGO_SYNC_FAILED:        'bg-red-100 text-red-700',
  PASSWORD_RESET:          'bg-amber-100 text-amber-700',
  MFA_ENABLED:             'bg-green-100 text-green-700',
  CUSTOMER_CREATED:        'bg-blue-100 text-blue-700',
  EQUIPMENT_CREATED:       'bg-blue-100 text-blue-700',
  WORK_ORDER_CREATED:      'bg-violet-100 text-violet-700',
  WORK_ORDER_ASSIGNED:     'bg-amber-100 text-amber-700',
};

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit', page, entityType, action, userId, startDate, endDate],
    queryFn: () => auditApi.list({
      page, limit: 50,
      entityType: entityType || undefined,
      action: action || undefined,
      userId: userId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
  });

  const logs = (data as any)?.data?.data || [];
  const total = (data as any)?.data?.total || 0;

  const toggleRow = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  return (
    <>
      <PageHeader
        title="Denetim İzi"
        subtitle={`${total} kayıt — değiştirilemez arşiv`}
        actions={<Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>}
      />

      {/* Info banner */}
      <div className="mb-4 flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-300">
        <Shield className="w-4 h-4 flex-shrink-0" />
        Bu kayıtlar salt-okunurdur. Hiçbir kayıt silinemez veya değiştirilemez. Akreditasyon denetimlerinde delil olarak kullanılabilir.
      </div>

      {/* Filters */}
      <Card padding="sm" className="mb-4">
        <div className="flex flex-wrap gap-3">
          <Select
            options={[
              { value: '', label: 'Tüm Kayıt Tipleri' },
              { value: 'User', label: 'Kullanıcı' },
              { value: 'Customer', label: 'Müşteri' },
              { value: 'Equipment', label: 'Ekipman' },
              { value: 'Inspection', label: 'Denetim' },
              { value: 'Report', label: 'Rapor' },
              { value: 'WorkOrder', label: 'İş Emri' },
              { value: 'FormTemplate', label: 'Form Şablonu' },
              { value: 'LogoSyncQueue', label: 'LOGO Sync' },
              { value: 'Contract', label: 'Sözleşme' },
              { value: 'Calibration', label: 'Kalibrasyon' },
            ]}
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
            className="w-48"
          />
          <input
            type="text"
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1); }}
            placeholder="İşlem filtrele..."
            className="px-3 py-2 h-9 rounded-lg border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
          />
          <input
            type="text"
            value={userId}
            onChange={(e) => { setUserId(e.target.value); setPage(1); }}
            placeholder="Kullanıcı ID..."
            className="px-3 py-2 h-9 rounded-lg border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 w-40"
          />
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
          <span className="flex items-center text-sm text-slate-400">—</span>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
          {(entityType || action || userId || startDate || endDate) && (
            <Button variant="ghost" size="sm" onClick={() => { setEntityType(''); setAction(''); setUserId(''); setStartDate(''); setEndDate(''); setPage(1); }}>
              Filtreleri Temizle
            </Button>
          )}
        </div>
      </Card>

      <Card padding="none">
        {isLoading ? (
          <SkeletonTable rows={10} cols={7} />
        ) : logs.length === 0 ? (
          <EmptyState icon={<Activity className="w-12 h-12" />} title="Kayıt bulunamadı" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-8"></th>
                <th>Tarih/Saat</th>
                <th>Kullanıcı</th>
                <th>İşlem</th>
                <th>Kayıt Tipi</th>
                <th>Kayıt ID</th>
                <th>Açıklama</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log: any) => {
                const hasDetails = log.oldValues || log.newValues;
                const isExpanded = expandedRow === log.id;
                return (
                  <>
                    <tr
                      key={log.id}
                      className={hasDetails ? 'cursor-pointer' : ''}
                      onClick={() => hasDetails && toggleRow(log.id)}
                    >
                      <td>
                        {hasDetails && (
                          isExpanded
                            ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </td>
                      <td>
                        <span className="text-xs font-mono text-slate-500 whitespace-nowrap">
                          {formatDateTime(log.timestamp)}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <User className="w-3 h-3 text-slate-400" />
                          <span className="font-mono text-xs text-slate-500">{log.userId?.slice(0, 8) || 'system'}</span>
                        </div>
                      </td>
                      <td>
                        <Badge color={ACTION_COLORS[log.action] || 'bg-slate-100 text-slate-600'}>
                          {log.action}
                        </Badge>
                      </td>
                      <td>
                        <span className="text-xs text-slate-500">{log.entityType}</span>
                      </td>
                      <td>
                        <span className="font-mono text-xs text-slate-400">{log.entityId?.slice(0, 8)}</span>
                      </td>
                      <td>
                        <span className="text-xs text-slate-500 truncate max-w-[200px] block">
                          {log.description || log.ipAddress || '—'}
                        </span>
                      </td>
                    </tr>
                    {isExpanded && hasDetails && (
                      <tr key={`${log.id}-detail`}>
                        <td colSpan={7} className="!p-0">
                          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 border-y border-slate-100 dark:border-slate-700">
                            <div className="grid grid-cols-2 gap-4">
                              {log.oldValues && (
                                <div>
                                  <p className="text-xs font-semibold text-red-600 mb-1">Eski Değerler</p>
                                  <pre className="text-xs font-mono text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-lg p-3 overflow-x-auto max-h-48 border border-slate-200 dark:border-slate-700">
                                    {JSON.stringify(log.oldValues, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {log.newValues && (
                                <div>
                                  <p className="text-xs font-semibold text-green-600 mb-1">Yeni Değerler</p>
                                  <pre className="text-xs font-mono text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-lg p-3 overflow-x-auto max-h-48 border border-slate-200 dark:border-slate-700">
                                    {JSON.stringify(log.newValues, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                            {log.ipAddress && (
                              <p className="text-xs text-slate-400 mt-2">IP: {log.ipAddress}</p>
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

        {total > 50 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-sm text-slate-500">Toplam {total} kayıt — Sayfa {page}/{Math.ceil(total / 50)}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Önceki</Button>
              <Button variant="outline" size="sm" disabled={page * 50 >= total} onClick={() => setPage((p) => p + 1)}>Sonraki</Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
