'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { workOrdersApi, inspectionsApi, usersApi, useMutationWithToast } from '@/lib/api';
import {
  Card, CardHeader, CardTitle, Badge, Button,
  Tabs, EmptyState, Modal, Select, Input, StatCard, Textarea,
} from '@/components/ui';
import {
  formatDate, formatDateTime, WORK_ORDER_STATUS_LABELS,
  INSPECTION_STATUS_LABELS, USER_ROLE_LABELS,
} from '@/lib/utils';
import {
  ClipboardList, Calendar, User, Package, MapPin,
  CheckCircle2, Play, RotateCcw, FileText, ArrowLeft,
  AlertCircle, Clock, UserCheck, StickyNote, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState('overview');
  const [assignModal, setAssignModal] = useState(false);
  const [inspectorId, setInspectorId] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [plannedTime, setPlannedTime] = useState('');

  // ── Queries ───────────────────────────────────────────────────────────
  const { data: woData, isLoading, refetch } = useQuery({
    queryKey: ['work-order', id],
    queryFn: () => workOrdersApi.get(id),
    enabled: !!id,
  });
  const { data: insData } = useQuery({
    queryKey: ['inspections-by-wo', id],
    queryFn: () => inspectionsApi.list({ workOrderId: id, limit: 50 }),
    enabled: !!id,
  });
  const { data: inspectorsData } = useQuery({
    queryKey: ['users-inspectors'],
    queryFn: () => usersApi.list({ role: 'inspector', limit: 100 }),
    enabled: assignModal,
  });

  const wo = (woData as any)?.data;
  const inspections = (insData as any)?.data?.data || [];
  const inspectors = (inspectorsData as any)?.data?.data || [];

  // ── Mutations ─────────────────────────────────────────────────────────
  const assignMutation = useMutationWithToast(
    (data: any) => workOrdersApi.assign(id, data),
    {
      successMessage: 'Muayene elemanina atandi',
      invalidateKeys: [['work-order', id]],
      onSuccess: () => {
        setAssignModal(false);
        setInspectorId('');
        setPlannedDate('');
        setPlannedTime('');
      },
    },
  );

  const updateStatusMutation = useMutationWithToast(
    (status: string) => workOrdersApi.updateStatus(id, status),
    {
      successMessage: 'Durum guncellendi',
      invalidateKeys: [['work-order', id], ['work-orders']],
    },
  );

  // ── Loading / not found ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <>
        <div className="space-y-4">
          <div className="h-10 skeleton rounded-xl w-64" />
          <div className="h-48 skeleton rounded-xl" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 skeleton rounded-xl" />
            ))}
          </div>
          <div className="h-64 skeleton rounded-xl" />
        </div>
      </>
    );
  }

  if (!wo) {
    return (
      <>
        <EmptyState
          icon={<ClipboardList className="w-10 h-10" />}
          title="Is emri bulunamadi"
          action={<Button onClick={() => router.push('/work-orders')}>Geri Don</Button>}
        />
      </>
    );
  }

  const statusInfo = WORK_ORDER_STATUS_LABELS[wo.status] || { label: wo.status, color: '' };
  const equipItems = wo.equipmentItems || [];

  const priorityLabels: Record<string, { label: string; color: string }> = {
    normal: { label: 'Normal', color: 'bg-slate-100 text-slate-600' },
    urgent: { label: 'Acil', color: 'bg-amber-100 text-amber-700' },
    critical: { label: 'Kritik', color: 'bg-red-100 text-red-700' },
  };
  const priorityInfo = priorityLabels[wo.priority] || priorityLabels.normal;

  const activeInspections = inspections.filter(
    (i: any) => i.status === 'in_progress' || i.status === 'submitted',
  ).length;

  const tabs = [
    { key: 'overview', label: 'Genel' },
    { key: 'equipment', label: 'Ekipmanlar', count: equipItems.length },
    { key: 'inspections', label: 'Denetimler', count: inspections.length },
  ];

  return (
    <>
      {/* Back button */}
      <button
        onClick={() => router.push('/work-orders')}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Is Emirleri
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-teal-100 dark:bg-teal-950/40 flex items-center justify-center">
            <ClipboardList className="w-7 h-7 text-teal-600" />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="font-display font-extrabold text-2xl text-slate-900 dark:text-slate-100 tracking-tight font-mono">
                {wo.workOrderNumber}
              </h1>
              <Badge color={statusInfo.color} dot>{statusInfo.label}</Badge>
              <Badge color={priorityInfo.color}>{priorityInfo.label}</Badge>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              {wo.customer?.name && <span>{wo.customer.name}</span>}
              {wo.location?.name && (
                <span className="flex items-center gap-1 text-slate-400">
                  <MapPin className="w-3.5 h-3.5" /> {wo.location.name}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          {/* Status transition buttons */}
          {(wo.status === 'draft' || wo.status === 'planned') && (
            <Button
              size="sm"
              icon={<UserCheck className="w-4 h-4" />}
              onClick={() => setAssignModal(true)}
            >
              Muayene Elemanina Ata
            </Button>
          )}
          {wo.status === 'assigned' && (
            <Button
              size="sm"
              icon={<Play className="w-4 h-4" />}
              loading={updateStatusMutation.isPending}
              onClick={() => updateStatusMutation.mutate('in_progress')}
            >
              Baslat
            </Button>
          )}
          {wo.status === 'in_progress' && (
            <Button
              size="sm"
              icon={<CheckCircle2 className="w-4 h-4" />}
              loading={updateStatusMutation.isPending}
              onClick={() => updateStatusMutation.mutate('completed')}
            >
              Tamamla
            </Button>
          )}
          {wo.status === 'report_approved' && (
            <Button
              size="sm"
              icon={<FileText className="w-4 h-4" />}
              onClick={() => router.push(`/invoicing?workOrderId=${id}`)}
            >
              Fatura Olustur
            </Button>
          )}
        </div>
      </div>

      {/* No Contract Risk Banner */}
      {wo.noContractRisk && (
        <div className="mb-4 p-3 bg-orange-900/20 border border-orange-800/40 rounded-xl flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0" />
          <p className="text-sm text-orange-300">
            <strong>Sözleşmesiz İş:</strong> Bu iş emri aktif sözleşme olmadan başlatılmıştır. Faturalama öncesi sözleşme durumunu kontrol edin.
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Ekipman Sayisi"
          value={equipItems.length}
          icon={<Package className="w-5 h-5 text-teal-600" />}
          color="bg-teal-50 dark:bg-teal-950/40"
        />
        <StatCard
          label="Planlanan Tarih"
          value={wo.plannedDate ? formatDate(wo.plannedDate) : '—'}
          icon={<Calendar className="w-5 h-5 text-violet-600" />}
          color="bg-violet-50 dark:bg-violet-950/40"
        />
        <StatCard
          label="Denetim Sayisi"
          value={inspections.length}
          icon={<ClipboardList className="w-5 h-5 text-amber-600" />}
          color="bg-amber-50 dark:bg-amber-950/40"
        />
        <StatCard
          label="Aktif Denetim"
          value={activeInspections}
          icon={<Play className="w-5 h-5 text-emerald-600" />}
          color="bg-emerald-50 dark:bg-emerald-950/40"
        />
      </div>

      <div className="mb-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Is Emri Bilgileri</CardTitle></CardHeader>
            <div className="space-y-3 text-sm">
              {[
                { label: 'Is Emri No', value: wo.workOrderNumber, mono: true },
                { label: 'Musteri', value: wo.customer?.name },
                { label: 'Musteri Kodu', value: wo.customer?.code, mono: true },
                { label: 'Lokasyon', value: wo.location?.name },
                { label: 'Planlanan Tarih', value: formatDate(wo.plannedDate) },
                { label: 'Planlanan Saat', value: wo.plannedTime?.slice(0, 5) },
                { label: 'Oncelik', value: priorityInfo.label },
                { label: 'Ekipman Sayisi', value: equipItems.length },
                { label: 'Olusturulma', value: formatDateTime(wo.createdAt) },
                { label: 'Guncelleme', value: formatDateTime(wo.updatedAt) },
              ].map(
                (row) =>
                  row.value && (
                    <div key={row.label} className="flex items-center gap-3">
                      <span className="w-36 text-slate-400 flex-shrink-0">{row.label}</span>
                      <span
                        className={`text-slate-700 dark:text-slate-300 ${
                          (row as any).mono
                            ? 'font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded'
                            : ''
                        }`}
                      >
                        {row.value}
                      </span>
                    </div>
                  ),
              )}
            </div>
          </Card>

          <Card>
            <CardHeader><CardTitle>Atama Bilgileri</CardTitle></CardHeader>
            <div className="space-y-3 text-sm">
              {wo.assignedInspectorId ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="w-36 text-slate-400">Muayene Elemani</span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {wo.assignedInspector?.fullName || wo.assignedInspectorId.slice(0, 8) + '...'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-36 text-slate-400">Atanma Tarihi</span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {formatDateTime(wo.assignedAt)}
                    </span>
                  </div>
                  {wo.startedAt && (
                    <div className="flex items-center gap-3">
                      <span className="w-36 text-slate-400">Baslanma Tarihi</span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {formatDateTime(wo.startedAt)}
                      </span>
                    </div>
                  )}
                  {wo.completedAt && (
                    <div className="flex items-center gap-3">
                      <span className="w-36 text-slate-400">Tamamlanma Tarihi</span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {formatDateTime(wo.completedAt)}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-6 text-center">
                  <User className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm mb-3">Henuz atanmamis</p>
                  <Button
                    size="sm"
                    icon={<UserCheck className="w-4 h-4" />}
                    onClick={() => setAssignModal(true)}
                  >
                    Ata
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {wo.notes && (
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <StickyNote className="w-4 h-4" /> Notlar
                </CardTitle>
              </CardHeader>
              <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                {wo.notes}
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Equipment items */}
      {tab === 'equipment' && (
        <Card padding="none">
          {equipItems.length === 0 ? (
            <EmptyState icon={<Package className="w-10 h-10" />} title="Ekipman eklenmemis" />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Envanter Kodu</th>
                  <th>Ekipman Tipi</th>
                  <th>Form Sablonu</th>
                  <th>Birim Fiyat</th>
                  <th>Hizmet Kodu</th>
                  <th>Durum</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {equipItems.map((item: any) => {
                  const itemInspection = inspections.find(
                    (ins: any) => ins.equipmentId === item.equipmentId,
                  );
                  return (
                    <tr key={item.id}>
                      <td>
                        <button
                          className="font-mono text-xs text-teal-600 hover:underline"
                          onClick={() => router.push(`/equipment/${item.equipmentId}`)}
                        >
                          {item.equipment?.inventoryCode || item.equipmentId?.slice(0, 8) + '...'}
                        </button>
                      </td>
                      <td>
                        <span className="text-sm text-slate-500">
                          {item.equipment?.equipmentType?.name || '—'}
                        </span>
                      </td>
                      <td>
                        <span className="text-sm text-slate-500">
                          {item.formTemplateId
                            ? item.formTemplate?.code || item.formTemplateId.slice(0, 8) + '...'
                            : '—'}
                        </span>
                      </td>
                      <td>
                        <span className="text-sm text-slate-500">
                          {item.unitPrice ? `${Number(item.unitPrice).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL` : '—'}
                        </span>
                      </td>
                      <td>
                        <span className="font-mono text-xs text-slate-400">
                          {item.serviceCode || '—'}
                        </span>
                      </td>
                      <td>
                        <Badge
                          color={
                            item.status === 'completed'
                              ? 'bg-green-100 text-green-700'
                              : item.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-100 text-slate-500'
                          }
                          dot
                        >
                          {item.status === 'completed'
                            ? 'Tamamlandi'
                            : item.status === 'in_progress'
                            ? 'Devam Ediyor'
                            : item.status === 'pending'
                            ? 'Bekliyor'
                            : item.status || 'Bekliyor'}
                        </Badge>
                      </td>
                      <td>
                        {itemInspection && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/inspections/${itemInspection.id}`)}
                          >
                            Denetim
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Inspections */}
      {tab === 'inspections' && (
        <Card padding="none">
          {inspections.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="w-10 h-10" />}
              title="Denetim baslatilmamis"
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Denetim ID</th>
                  <th>Ekipman</th>
                  <th>Form Rev.</th>
                  <th>Muayene Elemani</th>
                  <th>Sonuc</th>
                  <th>Tamamlanma</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {inspections.map((ins: any) => {
                  const s = INSPECTION_STATUS_LABELS[ins.status] || {
                    label: ins.status,
                    color: '',
                  };
                  const resultColors: Record<string, string> = {
                    uygun: 'bg-green-100 text-green-700',
                    uygunsuz: 'bg-red-100 text-red-700',
                    kismi_uygun: 'bg-amber-100 text-amber-700',
                  };
                  return (
                    <tr
                      key={ins.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/inspections/${ins.id}`)}
                    >
                      <td>
                        <span className="font-mono text-xs text-slate-500">
                          {ins.id?.slice(0, 8)}...
                        </span>
                      </td>
                      <td>
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                          {ins.equipment?.inventoryCode || ins.equipmentId?.slice(0, 8) + '...'}
                        </span>
                      </td>
                      <td>
                        <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                          {ins.formTemplateRevision}
                        </span>
                      </td>
                      <td>
                        <span className="text-sm text-slate-500">
                          {ins.inspector?.fullName || ins.inspectorId?.slice(0, 8) + '...'}
                        </span>
                      </td>
                      <td>
                        {ins.overallResult && (
                          <Badge color={resultColors[ins.overallResult] || ''}>
                            {ins.overallResult === 'uygun'
                              ? 'Uygun'
                              : ins.overallResult === 'uygunsuz'
                              ? 'Uygunsuz'
                              : ins.overallResult === 'kismi_uygun'
                              ? 'Kismi Uygun'
                              : ins.overallResult}
                          </Badge>
                        )}
                      </td>
                      <td>
                        <span className="text-sm text-slate-500">
                          {formatDate(ins.completedAt)}
                        </span>
                      </td>
                      <td>
                        <Badge color={s.color} dot>
                          {s.label}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Assign Modal */}
      <Modal
        open={assignModal}
        onClose={() => {
          setAssignModal(false);
          setInspectorId('');
          setPlannedDate('');
          setPlannedTime('');
        }}
        title="Muayene Elemanina Ata"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignModal(false)}>
              Iptal
            </Button>
            <Button
              loading={assignMutation.isPending}
              disabled={!inspectorId}
              onClick={() =>
                assignMutation.mutate({
                  inspectorId,
                  plannedDate: plannedDate || undefined,
                  plannedTime: plannedTime || undefined,
                })
              }
            >
              Ata
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Muayene Elemani"
            options={[
              { value: '', label: 'Secin...' },
              ...inspectors.map((u: any) => ({
                value: u.id,
                label: `${u.fullName} (${u.email})`,
              })),
            ]}
            value={inspectorId}
            onChange={(e: any) => setInspectorId(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Planlanan Tarih"
              type="date"
              value={plannedDate}
              onChange={(e: any) => setPlannedDate(e.target.value)}
            />
            <Input
              label="Planlanan Saat"
              type="time"
              value={plannedTime}
              onChange={(e: any) => setPlannedTime(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
