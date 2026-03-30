'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { inspectionsApi, reportsApi, useMutationWithToast } from '@/lib/api';
import {
  Card, CardHeader, CardTitle, Badge, Button,
  Tabs, EmptyState, Textarea, Modal, StatCard,
} from '@/components/ui';
import {
  formatDate, formatDateTime, INSPECTION_STATUS_LABELS,
} from '@/lib/utils';
import {
  ClipboardList, Camera, AlertTriangle, CheckCircle2,
  RotateCcw, FileText, ArrowLeft, MapPin, Clock,
  User, Package, Wifi, WifiOff, Smartphone, History,
  Send, Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function InspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState('overview');
  const [reviewNote, setReviewNote] = useState('');
  const [reviewModal, setReviewModal] = useState<'approve' | 'revision' | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inspection', id],
    queryFn: () => inspectionsApi.get(id),
    enabled: !!id,
  });

  const inspection = (data as any)?.data;

  // ── Mutations ─────────────────────────────────────────────────────────
  const submitMutation = useMutationWithToast(
    () => inspectionsApi.submit(id),
    {
      successMessage: 'Denetim gonderildi',
      invalidateKeys: [['inspection', id], ['inspections']],
    },
  );

  const reviewMutation = useMutationWithToast(
    ({ action, note }: any) => inspectionsApi.review(id, action, note),
    {
      successMessage: 'Islem tamamlandi',
      invalidateKeys: [['inspection', id], ['inspections']],
      onSuccess: () => {
        setReviewModal(null);
        setReviewNote('');
      },
    },
  );

  const createReportMutation = useMutationWithToast(
    () => reportsApi.createFromInspection(id),
    {
      successMessage: 'Rapor olusturuldu',
      invalidateKeys: [['inspection', id]],
      onSuccess: (res: any) => router.push(`/reports/${res?.data?.id}`),
    },
  );

  // ── Loading / not found ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <>
        <div className="space-y-4">
          <div className="h-10 skeleton rounded-xl w-64" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 skeleton rounded-xl" />
            ))}
          </div>
          <div className="h-48 skeleton rounded-xl" />
        </div>
      </>
    );
  }

  if (!inspection) {
    return (
      <>
        <EmptyState
          icon={<ClipboardList className="w-10 h-10" />}
          title="Denetim bulunamadi"
          action={<Button onClick={() => router.push('/inspections')}>Geri Don</Button>}
        />
      </>
    );
  }

  const statusInfo = INSPECTION_STATUS_LABELS[inspection.status] || {
    label: inspection.status,
    color: '',
  };
  const fieldValues = inspection.fieldValues || [];
  const photos = inspection.photos || [];
  const ncs = inspection.nonconformities || [];
  const reviewHistory = inspection.reviewHistory || [];

  const resultColors: Record<string, string> = {
    uygun: 'bg-green-100 text-green-700',
    uygunsuz: 'bg-red-100 text-red-700',
    kismi_uygun: 'bg-amber-100 text-amber-700',
    uygulanamaz: 'bg-slate-100 text-slate-500',
  };
  const resultLabels: Record<string, string> = {
    uygun: 'Uygun',
    uygunsuz: 'Uygunsuz',
    kismi_uygun: 'Kismi Uygun',
    uygulanamaz: 'Uygulanamaz',
  };

  const tabs = [
    { key: 'overview', label: 'Genel' },
    { key: 'fields', label: 'Alan Degerleri', count: fieldValues.length },
    { key: 'photos', label: 'Fotograflar', count: photos.length },
    { key: 'nonconformities', label: 'Uygunsuzluklar', count: ncs.length },
    { key: 'history', label: 'Inceleme Gecmisi', count: reviewHistory.length },
  ];

  return (
    <>
      <button
        onClick={() => router.push('/inspections')}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Denetimler
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="font-display font-extrabold text-xl text-slate-900 dark:text-slate-100">
              Denetim Kaydi
            </h1>
            <Badge color={statusInfo.color} dot>
              {statusInfo.label}
            </Badge>
            {inspection.overallResult && (
              <Badge color={resultColors[inspection.overallResult] || ''}>
                {resultLabels[inspection.overallResult] || inspection.overallResult}
              </Badge>
            )}
            {inspection.offlineCreated && (
              <Badge color="bg-violet-100 text-violet-700">
                <WifiOff className="w-3 h-3 mr-1 inline" />
                Offline
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              {inspection.id?.slice(0, 12)}...
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {formatDateTime(inspection.startedAt)}
            </span>
            {inspection.latitude && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {inspection.latitude.toFixed(4)}, {inspection.longitude?.toFixed(4)}
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          {inspection.status === 'completed' && (
            <Button
              size="sm"
              icon={<Send className="w-4 h-4" />}
              loading={submitMutation.isPending}
              onClick={() => submitMutation.mutate(undefined as any)}
            >
              Gonder
            </Button>
          )}
          {(inspection.status === 'submitted' || inspection.status === 'under_review') && (
            <>
              <Button
                size="sm"
                icon={<CheckCircle2 className="w-4 h-4" />}
                onClick={() => setReviewModal('approve')}
              >
                Onayla
              </Button>
              <Button
                size="sm"
                variant="outline"
                icon={<RotateCcw className="w-4 h-4" />}
                onClick={() => setReviewModal('revision')}
              >
                Iade Et
              </Button>
            </>
          )}
          {inspection.status === 'approved' && (
            <Button
              size="sm"
              icon={<FileText className="w-4 h-4" />}
              loading={createReportMutation.isPending}
              onClick={() => createReportMutation.mutate(undefined as any)}
            >
              Rapor Olustur
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Alan Degeri"
          value={fieldValues.length}
          icon={<ClipboardList className="w-5 h-5 text-teal-600" />}
          color="bg-teal-50 dark:bg-teal-950/40"
        />
        <StatCard
          label="Fotograf"
          value={photos.length}
          icon={<Camera className="w-5 h-5 text-violet-600" />}
          color="bg-violet-50 dark:bg-violet-950/40"
        />
        <StatCard
          label="Uygunsuzluk"
          value={ncs.length}
          icon={<AlertTriangle className="w-5 h-5 text-amber-600" />}
          color="bg-amber-50 dark:bg-amber-950/40"
        />
        <StatCard
          label="Sonuc"
          value={resultLabels[inspection.overallResult] || '—'}
          icon={
            inspection.overallResult === 'uygun' ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : inspection.overallResult === 'uygunsuz' ? (
              <AlertTriangle className="w-5 h-5 text-red-600" />
            ) : (
              <Eye className="w-5 h-5 text-slate-500" />
            )
          }
          color={
            inspection.overallResult === 'uygun'
              ? 'bg-green-50 dark:bg-green-950/40'
              : inspection.overallResult === 'uygunsuz'
              ? 'bg-red-50 dark:bg-red-950/40'
              : 'bg-slate-50 dark:bg-slate-800/40'
          }
        />
      </div>

      <div className="mb-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Denetim Bilgileri</CardTitle></CardHeader>
            <div className="space-y-3 text-sm">
              {[
                { label: 'Denetim ID', value: inspection.id, mono: true },
                { label: 'Is Emri', value: inspection.workOrderId?.slice(0, 8) + '...', mono: true, link: inspection.workOrderId ? `/work-orders/${inspection.workOrderId}` : undefined },
                { label: 'Form Sablonu', value: inspection.formTemplate?.code || inspection.formTemplateId?.slice(0, 8) + '...' },
                { label: 'Form Rev.', value: inspection.formTemplateRevision, mono: true },
                { label: 'Baslangic', value: formatDateTime(inspection.startedAt) },
                { label: 'Tamamlanma', value: formatDateTime(inspection.completedAt) },
                { label: 'Gonderilme', value: formatDateTime(inspection.submittedAt) },
              ].map(
                (row) =>
                  row.value && (
                    <div key={row.label} className="flex items-center gap-3">
                      <span className="w-32 text-slate-400 flex-shrink-0">{row.label}</span>
                      {(row as any).link ? (
                        <button
                          className="font-mono text-xs text-teal-600 hover:underline bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded"
                          onClick={() => router.push((row as any).link)}
                        >
                          {row.value}
                        </button>
                      ) : (
                        <span
                          className={`text-slate-700 dark:text-slate-300 ${
                            (row as any).mono
                              ? 'font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded'
                              : ''
                          }`}
                        >
                          {row.value}
                        </span>
                      )}
                    </div>
                  ),
              )}
            </div>
          </Card>

          <Card>
            <CardHeader><CardTitle>Ekipman & Muayene Elemani</CardTitle></CardHeader>
            <div className="space-y-3 text-sm">
              {[
                { label: 'Ekipman', value: inspection.equipment?.inventoryCode || inspection.equipmentId?.slice(0, 8) + '...', link: inspection.equipmentId ? `/equipment/${inspection.equipmentId}` : undefined },
                { label: 'Ekipman Tipi', value: inspection.equipment?.equipmentType?.name },
                { label: 'Marka / Model', value: inspection.equipment?.brand ? `${inspection.equipment.brand} ${inspection.equipment.model || ''}` : undefined },
                { label: 'Muayene Elemani', value: inspection.inspector?.fullName || inspection.inspectorId?.slice(0, 8) + '...' },
                { label: 'Musteri', value: inspection.equipment?.customer?.name || inspection.customer?.name },
              ].map(
                (row) =>
                  row.value && (
                    <div key={row.label} className="flex items-center gap-3">
                      <span className="w-32 text-slate-400 flex-shrink-0">{row.label}</span>
                      {(row as any).link ? (
                        <button
                          className="text-sm text-teal-600 hover:underline"
                          onClick={() => router.push((row as any).link)}
                        >
                          {row.value}
                        </button>
                      ) : (
                        <span className="text-slate-700 dark:text-slate-300">{row.value}</span>
                      )}
                    </div>
                  ),
              )}
            </div>
          </Card>

          {/* Offline sync info */}
          {inspection.offlineCreated && (
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4" /> Offline Senkronizasyon Bilgisi
                </CardTitle>
              </CardHeader>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-slate-400 text-xs mb-1">Cihaz ID</p>
                  <p className="font-mono text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                    {inspection.deviceId || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs mb-1">Cihaz Zamani</p>
                  <p className="text-slate-700 dark:text-slate-300">
                    {formatDateTime(inspection.deviceTimestamp)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs mb-1">Sunucu Zamani</p>
                  <p className="text-slate-700 dark:text-slate-300">
                    {formatDateTime(inspection.serverTimestamp)}
                  </p>
                </div>
              </div>
              {inspection.deviceTimestamp && inspection.serverTimestamp && (
                <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-300">
                  Cihaz ve sunucu zaman damgalari arasindaki fark:{' '}
                  {Math.abs(
                    (new Date(inspection.serverTimestamp).getTime() -
                      new Date(inspection.deviceTimestamp).getTime()) /
                      1000,
                  ).toFixed(0)}{' '}
                  saniye
                </div>
              )}
            </Card>
          )}

          {/* Assessment / Result */}
          <Card className={inspection.offlineCreated ? '' : 'md:col-span-2'}>
            <CardHeader><CardTitle>Degerlendirme</CardTitle></CardHeader>
            <div className="space-y-3">
              <div className="text-center py-4">
                {inspection.overallResult ? (
                  <div>
                    <Badge
                      color={resultColors[inspection.overallResult] || ''}
                      className="text-base px-4 py-2"
                    >
                      {(resultLabels[inspection.overallResult] || inspection.overallResult).toUpperCase()}
                    </Badge>
                    <p className="text-xs text-slate-400 mt-2">Genel Sonuc</p>
                  </div>
                ) : (
                  <p className="text-slate-400 text-sm">Henuz sonuc girilmemis</p>
                )}
              </div>

              {inspection.inspectorNotes && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Muayene Elemani Notu</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                    {inspection.inspectorNotes}
                  </p>
                </div>
              )}

              {inspection.reviewerNotes && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Teknik Yonetici Notu</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                    {inspection.reviewerNotes}
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Field values */}
      {tab === 'fields' && (
        <Card padding="none">
          {fieldValues.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="w-10 h-10" />}
              title="Alan degeri girilmemis"
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Alan Anahtari</th>
                  <th>Etiket</th>
                  <th>Deger</th>
                  <th>Giren</th>
                  <th>Girilme Zamani</th>
                </tr>
              </thead>
              <tbody>
                {fieldValues.map((fv: any) => (
                  <tr key={fv.id}>
                    <td>
                      <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                        {fv.fieldKey}
                      </span>
                    </td>
                    <td>
                      <span className="text-sm text-slate-700 dark:text-slate-300">
                        {fv.label || fv.fieldKey}
                      </span>
                    </td>
                    <td>
                      <span className="text-sm text-slate-700 dark:text-slate-300">
                        {fv.valueText ??
                          fv.valueNumber ??
                          (fv.valueBoolean !== null && fv.valueBoolean !== undefined
                            ? fv.valueBoolean
                              ? 'Evet'
                              : 'Hayir'
                            : null) ??
                          (fv.valueJson
                            ? JSON.stringify(fv.valueJson).slice(0, 80)
                            : '—')}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs text-slate-400">
                        {fv.enteredBy?.fullName || fv.enteredById?.slice(0, 8) || '—'}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs text-slate-400">
                        {formatDateTime(fv.enteredAt)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Photos */}
      {tab === 'photos' && (
        <div>
          {photos.length === 0 ? (
            <Card>
              <EmptyState icon={<Camera className="w-10 h-10" />} title="Fotograf eklenmemis" />
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {photos.map((photo: any) => (
                <div
                  key={photo.id}
                  className="group relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 aspect-square bg-slate-100 dark:bg-slate-800"
                >
                  {photo.fileUrl ? (
                    <img
                      src={photo.fileUrl}
                      alt={photo.caption || photo.fieldKey || 'Denetim fotografi'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Camera className="w-8 h-8 text-slate-300" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    {photo.caption && (
                      <p className="text-white text-xs mb-1">{photo.caption}</p>
                    )}
                    {photo.fieldKey && (
                      <p className="text-white/70 text-xs mb-1">{photo.fieldKey}</p>
                    )}
                    {photo.latitude && (
                      <p className="text-white/50 text-xs flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {photo.latitude.toFixed(4)}, {photo.longitude?.toFixed(4)}
                      </p>
                    )}
                    <Badge
                      color={
                        photo.syncStatus === 'synced'
                          ? 'bg-green-500/80 text-white'
                          : 'bg-amber-500/80 text-white'
                      }
                      className="mt-1"
                    >
                      {photo.syncStatus === 'synced' ? 'Senkronize' : photo.syncStatus}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Nonconformities */}
      {tab === 'nonconformities' && (
        <div className="space-y-4">
          {ncs.length === 0 ? (
            <Card>
              <EmptyState
                icon={<AlertTriangle className="w-10 h-10" />}
                title="Uygunsuzluk kaydi yok"
              />
            </Card>
          ) : (
            ncs.map((nc: any) => {
              const sevColors: Record<string, string> = {
                critical:
                  'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800',
                major:
                  'bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800',
                minor:
                  'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800',
                observation:
                  'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800',
              };
              const sevBadge: Record<string, string> = {
                critical: 'bg-red-100 text-red-700',
                major: 'bg-orange-100 text-orange-700',
                minor: 'bg-amber-100 text-amber-700',
                observation: 'bg-blue-100 text-blue-700',
              };
              const sevLabels: Record<string, string> = {
                critical: 'Kritik',
                major: 'Major',
                minor: 'Minor',
                observation: 'Gozlem',
              };
              return (
                <div
                  key={nc.id}
                  className={`rounded-xl border p-4 ${sevColors[nc.severity] || ''}`}
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {nc.description}
                    </p>
                    {nc.severity && (
                      <Badge color={sevBadge[nc.severity] || ''}>
                        {sevLabels[nc.severity] || nc.severity}
                      </Badge>
                    )}
                  </div>
                  {nc.fieldKey && (
                    <p className="text-xs text-slate-500 mb-2">
                      Alan: <span className="font-mono">{nc.fieldKey}</span>
                    </p>
                  )}
                  {nc.recommendation && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1">Oneri</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {nc.recommendation}
                      </p>
                    </div>
                  )}
                  {nc.correctiveAction && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold text-slate-500 mb-1">
                        Duzeltici Faaliyet
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {nc.correctiveAction}
                      </p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Review History */}
      {tab === 'history' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-4 h-4" /> Inceleme Gecmisi
            </CardTitle>
          </CardHeader>
          {reviewHistory.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">
              Henuz inceleme islemi yapilmamis
            </p>
          ) : (
            <div className="space-y-4">
              {reviewHistory.map((h: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 pb-4 border-b border-slate-100 dark:border-slate-800 last:border-0 last:pb-0"
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      h.action === 'approved' || h.action === 'approve'
                        ? 'bg-green-100 dark:bg-green-900/40'
                        : h.action === 'revision_requested' || h.action === 'request_revision'
                        ? 'bg-amber-100 dark:bg-amber-900/40'
                        : h.action === 'submitted'
                        ? 'bg-blue-100 dark:bg-blue-900/40'
                        : 'bg-slate-100 dark:bg-slate-800'
                    }`}
                  >
                    {h.action === 'approved' || h.action === 'approve' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : h.action === 'revision_requested' || h.action === 'request_revision' ? (
                      <RotateCcw className="w-4 h-4 text-amber-600" />
                    ) : h.action === 'submitted' ? (
                      <Send className="w-4 h-4 text-blue-600" />
                    ) : (
                      <History className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {h.action === 'approved' || h.action === 'approve'
                          ? 'Onaylandi'
                          : h.action === 'revision_requested' || h.action === 'request_revision'
                          ? 'Revizyon Istendi'
                          : h.action === 'submitted'
                          ? 'Gonderildi'
                          : h.action}
                      </p>
                      {h.reviewer?.fullName && (
                        <span className="text-xs text-slate-400">
                          - {h.reviewer.fullName}
                        </span>
                      )}
                    </div>
                    {h.note && (
                      <p className="text-sm text-slate-500 bg-slate-50 dark:bg-slate-800 p-2 rounded-lg mb-1">
                        {h.note}
                      </p>
                    )}
                    {h.comment && (
                      <p className="text-sm text-slate-500 bg-slate-50 dark:bg-slate-800 p-2 rounded-lg mb-1">
                        {h.comment}
                      </p>
                    )}
                    <p className="text-xs text-slate-300 dark:text-slate-600">
                      {formatDateTime(h.timestamp || h.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Review Modal */}
      <Modal
        open={!!reviewModal}
        onClose={() => {
          setReviewModal(null);
          setReviewNote('');
        }}
        title={reviewModal === 'approve' ? 'Denetimi Onayla' : 'Revizyon Iste'}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setReviewModal(null);
                setReviewNote('');
              }}
            >
              Iptal
            </Button>
            <Button
              variant={reviewModal === 'approve' ? 'primary' : 'danger'}
              loading={reviewMutation.isPending}
              onClick={() =>
                reviewMutation.mutate({
                  action:
                    reviewModal === 'approve' ? 'approve' : 'request_revision',
                  note: reviewNote,
                })
              }
            >
              {reviewModal === 'approve' ? 'Onayla' : 'Iade Et'}
            </Button>
          </>
        }
      >
        <Textarea
          label={
            reviewModal === 'approve'
              ? 'Onay Notu (opsiyonel)'
              : 'Revizyon Notu *'
          }
          value={reviewNote}
          onChange={(e: any) => setReviewNote(e.target.value)}
          placeholder={
            reviewModal === 'approve'
              ? 'Inceleme notu...'
              : 'Duzeltilmesi gerekenler...'
          }
          rows={4}
        />
      </Modal>
    </>
  );
}
