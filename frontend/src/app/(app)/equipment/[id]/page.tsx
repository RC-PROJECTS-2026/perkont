'use client';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { equipmentApi, inspectionsApi, reportsApi } from '@/lib/api';
import {
  PageHeader, Card, CardHeader, CardTitle, Badge,
  Button, Tabs, EmptyState, StatCard,
} from '@/components/ui';
import { formatDate, INSPECTION_STATUS_LABELS, REPORT_STATUS_LABELS } from '@/lib/utils';
import {
  Package, QrCode, Calendar, FileText,
  ClipboardList, AlertCircle, CheckCircle2, Download,
} from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';

export default function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState('info');

  const { data: eqData, isLoading } = useQuery({
    queryKey: ['equipment-detail', id],
    queryFn: () => equipmentApi.get(id),
    enabled: !!id,
  });
  const { data: insData } = useQuery({
    queryKey: ['inspections', { equipmentId: id }],
    queryFn: () => inspectionsApi.list({ equipmentId: id, limit: 20 }),
    enabled: !!id,
  });
  const { data: rpData } = useQuery({
    queryKey: ['reports', { equipmentId: id }],
    queryFn: () => reportsApi.list({ equipmentId: id, limit: 20 }),
    enabled: !!id,
  });

  const equipment   = (eqData as any)?.data;
  const inspections = (insData as any)?.data?.data || [];
  const reports     = (rpData as any)?.data?.data || [];

  const downloadQr = async () => {
    try {
      const blob = await equipmentApi.getQrLabel(id);
      const url = URL.createObjectURL(blob as any);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qr-${equipment?.inventoryCode}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('QR etiket indirilemedi');
    }
  };

  if (isLoading || !equipment) {
    return (
      <>
        <div className="space-y-4">
          <div className="h-10 skeleton rounded-xl w-64" />
          <div className="h-48 skeleton rounded-xl" />
        </div>
      </>
    );
  }

  const nextControl = equipment.nextControlDate ? new Date(equipment.nextControlDate) : null;
  const daysLeft = nextControl ? Math.ceil((nextControl.getTime() - Date.now()) / 86400000) : null;
  const isOverdue  = daysLeft !== null && daysLeft < 0;
  const isUrgent   = daysLeft !== null && daysLeft >= 0 && daysLeft <= 14;

  const tabs = [
    { key: 'info',        label: 'Teknik Bilgiler' },
    { key: 'inspections', label: 'Denetim Geçmişi', count: inspections.length },
    { key: 'reports',     label: 'Raporlar',         count: reports.length },
  ];

  return (
    <>
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <Package className="w-7 h-7 text-slate-600" />
          </div>
          <div>
            <h1 className="font-display font-extrabold text-2xl text-slate-900 dark:text-slate-100 tracking-tight font-mono">
              {equipment.inventoryCode}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-slate-500">{equipment.equipmentType?.name}</span>
              {equipment.brand && <span className="text-xs text-slate-400">· {equipment.brand} {equipment.model}</span>}
              <Badge
                color={equipment.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}
                dot
              >
                {equipment.status === 'active' ? 'Aktif' : equipment.status}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" size="sm" icon={<QrCode className="w-4 h-4" />} onClick={downloadQr}>
            QR Etiket İndir
          </Button>
          <Button size="sm" icon={<ClipboardList className="w-4 h-4" />}
            onClick={() => router.push(`/work-orders/new?equipmentId=${id}`)}>
            İş Emri Oluştur
          </Button>
        </div>
      </div>

      {/* Kontrol durumu banner */}
      {nextControl && (isOverdue || isUrgent) && (
        <div className={`
          flex items-center gap-3 p-4 rounded-xl mb-4 border text-sm
          ${isOverdue
            ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
            : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
          }
        `}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {isOverdue
            ? `Bu ekipmanın periyodik kontrolü ${Math.abs(daysLeft!)} gün gecikmiş! Son kontrol tarihi: ${formatDate(equipment.nextControlDate)}`
            : `Periyodik kontrol tarihine ${daysLeft} gün kaldı. Tarih: ${formatDate(equipment.nextControlDate)}`
          }
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Son Kontrol"
          value={formatDate(equipment.lastControlDate) || '—'}
          icon={<Calendar className="w-5 h-5 text-teal-600" />}
          color="bg-teal-50 dark:bg-teal-950/40"
        />
        <StatCard
          label={isOverdue ? 'GECİKME' : 'Sonraki Kontrol'}
          value={daysLeft !== null ? (isOverdue ? `${Math.abs(daysLeft)}g` : `${daysLeft}g`) : '—'}
          icon={isOverdue
            ? <AlertCircle className="w-5 h-5 text-red-600" />
            : <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
          color={isOverdue ? 'bg-red-50 dark:bg-red-950/40' : 'bg-emerald-50 dark:bg-emerald-950/40'}
        />
        <StatCard
          label="Toplam Denetim"
          value={inspections.length}
          icon={<ClipboardList className="w-5 h-5 text-violet-600" />}
          color="bg-violet-50 dark:bg-violet-950/40"
        />
        <StatCard
          label="Toplam Rapor"
          value={reports.length}
          icon={<FileText className="w-5 h-5 text-amber-600" />}
          color="bg-amber-50 dark:bg-amber-950/40"
        />
      </div>

      <div className="mb-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      {/* Technical info */}
      {tab === 'info' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Ekipman Bilgileri</CardTitle></CardHeader>
            <div className="space-y-3">
              {[
                { label: 'Envanter Kodu', value: equipment.inventoryCode, mono: true },
                { label: 'QR Kodu', value: equipment.qrCode, mono: true },
                { label: 'Seri Numarası', value: equipment.serialNumber },
                { label: 'Ekipman Tipi', value: equipment.equipmentType?.name },
                { label: 'Marka', value: equipment.brand },
                { label: 'Model', value: equipment.model },
                { label: 'Üretim Yılı', value: equipment.manufactureYear },
                { label: 'Kapasite', value: equipment.capacity },
                { label: 'Kurulum Yeri', value: equipment.installationLocation },
              ].map((row) => row.value && (
                <div key={row.label} className="flex items-center gap-3 text-sm">
                  <span className="w-32 text-slate-400 flex-shrink-0">{row.label}</span>
                  <span className={`text-slate-700 dark:text-slate-300 ${row.mono ? 'font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded' : ''}`}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader><CardTitle>Bağlı Kayıtlar</CardTitle></CardHeader>
            <div className="space-y-3">
              {[
                { label: 'Müşteri', value: equipment.customer?.name },
                { label: 'Lokasyon', value: equipment.location?.name },
                { label: 'Kontrol Periyodu', value: equipment.controlPeriodMonths ? `${equipment.controlPeriodMonths} ay` : null },
                { label: 'İlk Kullanım', value: formatDate(equipment.firstUseDate) },
                { label: 'Son Kontrol', value: formatDate(equipment.lastControlDate) },
                { label: 'Sonraki Kontrol', value: formatDate(equipment.nextControlDate) },
              ].map((row) => row.value && (
                <div key={row.label} className="flex items-center gap-3 text-sm">
                  <span className="w-32 text-slate-400 flex-shrink-0">{row.label}</span>
                  <span className="text-slate-700 dark:text-slate-300">{row.value}</span>
                </div>
              ))}
            </div>
          </Card>

          {equipment.notes && (
            <Card className="md:col-span-2">
              <CardHeader><CardTitle>Notlar</CardTitle></CardHeader>
              <p className="text-sm text-slate-600 dark:text-slate-400">{equipment.notes}</p>
            </Card>
          )}
        </div>
      )}

      {/* Inspection history */}
      {tab === 'inspections' && (
        <Card padding="none">
          {inspections.length === 0 ? (
            <EmptyState icon={<ClipboardList className="w-10 h-10" />} title="Denetim geçmişi yok" />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Denetim ID</th>
                  <th>Form Rev.</th>
                  <th>Muayene Elemanı</th>
                  <th>Tamamlanma</th>
                  <th>Sonuç</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {inspections.map((ins: any) => {
                  const s = INSPECTION_STATUS_LABELS[ins.status] || { label: ins.status, color: '' };
                  const resultColors: Record<string, string> = {
                    uygun: 'bg-green-100 text-green-700',
                    uygunsuz: 'bg-red-100 text-red-700',
                    kismi_uygun: 'bg-amber-100 text-amber-700',
                  };
                  return (
                    <tr key={ins.id} className="cursor-pointer" onClick={() => router.push(`/inspections/${ins.id}`)}>
                      <td><span className="font-mono text-xs text-slate-500">{ins.id?.slice(0, 8)}…</span></td>
                      <td><span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{ins.formTemplateRevision}</span></td>
                      <td><span className="text-sm text-slate-500">{ins.inspectorId?.slice(0, 8)}…</span></td>
                      <td><span className="text-sm text-slate-500">{formatDate(ins.completedAt)}</span></td>
                      <td>
                        {ins.overallResult && (
                          <Badge color={resultColors[ins.overallResult] || ''}>
                            {ins.overallResult}
                          </Badge>
                        )}
                      </td>
                      <td><Badge color={s.color} dot>{s.label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Reports */}
      {tab === 'reports' && (
        <Card padding="none">
          {reports.length === 0 ? (
            <EmptyState icon={<FileText className="w-10 h-10" />} title="Rapor yok" />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rapor No</th>
                  <th>Form Rev.</th>
                  <th>Tarih</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r: any) => {
                  const s = REPORT_STATUS_LABELS[r.status] || { label: r.status, color: '' };
                  return (
                    <tr key={r.id} className="cursor-pointer" onClick={() => router.push(`/reports/${r.id}`)}>
                      <td><span className="font-mono text-xs font-semibold">{r.reportNumber}</span></td>
                      <td><span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{r.formTemplateRevision}</span></td>
                      <td><span className="text-sm text-slate-500">{formatDate(r.createdAt)}</span></td>
                      <td><Badge color={s.color} dot>{s.label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </>
  );
}
