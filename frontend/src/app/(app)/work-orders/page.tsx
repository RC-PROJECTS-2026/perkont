'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkOrders, workOrdersApi, useMutationWithToast, usersApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import {
  PageHeader, Card, Badge, Button, SearchInput,
  SkeletonTable, EmptyState, Tabs, Modal, Select, Input, StatCard,
} from '@/components/ui';
import { WORK_ORDER_STATUS_LABELS, formatDate } from '@/lib/utils';
import { ClipboardList, Plus, RefreshCw, UserPlus, Eye, Calendar } from 'lucide-react';

export default function WorkOrdersPage() {
  const router = useRouter();
  const [tab, setTab] = useState('assigned');
  const [search, setSearch] = useState('');
  const [assignModal, setAssignModal] = useState<any>(null);
  const [inspectorId, setInspectorId] = useState('');
  const [plannedDate, setPlannedDate] = useState('');

  const { data, isLoading, refetch } = useWorkOrders({ status: tab, limit: 50 });
  const workOrders = (data as any)?.data?.data || [];

  const { data: usersData } = useQuery({
    queryKey: ['users-inspectors'],
    queryFn: () => usersApi.list({ role: 'inspector', limit: 100 }),
  });
  const inspectors = (usersData as any)?.data?.data || [];

  const assignMutation = useMutationWithToast(
    ({ id, data }: any) => workOrdersApi.assign(id, data),
    {
      successMessage: 'İş emri atandı',
      invalidateKeys: [['work-orders']],
      onSuccess: () => { setAssignModal(null); setInspectorId(''); setPlannedDate(''); },
    },
  );

  const tabs = [
    { key: 'draft',           label: 'Taslak' },
    { key: 'planned',         label: 'Planlandı' },
    { key: 'assigned',        label: 'Atandı' },
    { key: 'in_progress',     label: 'Devam' },
    { key: 'completed',       label: 'Tamamlandı' },
    { key: 'report_approved', label: 'Rapor Onaylı' },
    { key: 'invoiced',        label: 'Faturalandı' },
  ];

  const filtered = workOrders.filter((w: any) =>
    !search ||
    w.workOrderNumber?.toLowerCase().includes(search.toLowerCase()) ||
    w.customer?.name?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title="İş Emirleri"
        subtitle="Planlama ve atama yönetimi"
        actions={
          <>
            <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => router.push('/work-orders/new')}>
              Yeni İş Emri
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        <div className="ml-auto">
          <SearchInput value={search} onChange={setSearch} placeholder="İş emri veya müşteri ara..." className="w-64" />
        </div>
      </div>

      <Card padding="none">
        {isLoading ? (
          <SkeletonTable rows={8} cols={7} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<ClipboardList className="w-12 h-12" />} title="Bu durumda iş emri yok"
            description="Yeni bir iş emri oluşturarak başlayın."
            action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => router.push('/work-orders/new')}>İş Emri Oluştur</Button>} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>İş Emri No</th>
                <th>Müşteri</th>
                <th>Lokasyon</th>
                <th>Ekipman Sayısı</th>
                <th>Atanan Kişi</th>
                <th>Planlanan Tarih</th>
                <th>Öncelik</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((wo: any) => {
                const statusInfo = WORK_ORDER_STATUS_LABELS[wo.status] || { label: wo.status, color: '' };
                return (
                  <tr key={wo.id} className="cursor-pointer" onClick={() => router.push(`/work-orders/${wo.id}`)}>
                    <td>
                      <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {wo.workOrderNumber}
                      </span>
                    </td>
                    <td>
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{wo.customer?.name}</p>
                      </div>
                    </td>
                    <td>
                      <span className="text-sm text-slate-500">{wo.location?.name || '—'}</span>
                    </td>
                    <td>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {wo.equipmentItems?.length || 0}
                      </span>
                    </td>
                    <td>
                      <span className="text-sm text-slate-500">
                        {wo.assignedInspectorId ? `${wo.assignedInspectorId.slice(0, 6)}…` : '—'}
                      </span>
                    </td>
                    <td>
                      {wo.plannedDate ? (
                        <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(wo.plannedDate)}
                        </div>
                      ) : <span className="text-slate-300 text-sm">—</span>}
                    </td>
                    <td>
                      {wo.priority && (
                        <Badge color={
                          wo.priority === 'critical' ? 'bg-red-100 text-red-700' :
                          wo.priority === 'urgent' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-500'
                        }>
                          {wo.priority === 'critical' ? 'Kritik' : wo.priority === 'urgent' ? 'Acil' : 'Normal'}
                        </Badge>
                      )}
                    </td>
                    <td>
                      <Badge color={statusInfo.color} dot>{statusInfo.label}</Badge>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => router.push(`/work-orders/${wo.id}`)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {(wo.status === 'draft' || wo.status === 'planned') && (
                          <button
                            onClick={() => setAssignModal(wo)}
                            className="p-1.5 rounded-lg hover:bg-teal-50 text-slate-400 hover:text-teal-600"
                            title="Ata"
                          >
                            <UserPlus className="w-4 h-4" />
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

      {/* Assign Modal */}
      <Modal
        open={!!assignModal}
        onClose={() => { setAssignModal(null); setInspectorId(''); setPlannedDate(''); }}
        title={`İş Emri Ata — ${assignModal?.workOrderNumber}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignModal(null)}>İptal</Button>
            <Button
              loading={assignMutation.isPending}
              onClick={() => assignMutation.mutate({
                id: assignModal?.id,
                data: { inspectorId, plannedDate },
              })}
              disabled={!inspectorId}
            >
              Ata
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Muayene Elemanı"
            value={inspectorId}
            onChange={(e) => setInspectorId(e.target.value)}
            options={inspectors.map((u: any) => ({ value: u.id, label: u.fullName }))}
            placeholder="Seçiniz..."
            required
          />
          <Input
            label="Planlanan Tarih"
            type="date"
            value={plannedDate}
            onChange={(e) => setPlannedDate(e.target.value)}
          />
        </div>
      </Modal>
    </>
  );
}
