'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { contractEngineApi, useMutationWithToast } from '@/lib/api';
import {
  Card, CardHeader, CardTitle, Badge, Button,
  Modal, EmptyState, StatCard, Tabs, Textarea,
} from '@/components/ui';
import { formatDate, formatDateTime } from '@/lib/utils';
import {
  ArrowLeft, Send, CheckCircle2, Download, Printer, Upload,
  FileCheck, Clock, DollarSign, Calendar, Building2,
  AlertTriangle, Zap, File, ExternalLink, PenTool, CheckCircle, FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';

const statusColors: Record<string, string> = {
  draft:    'bg-slate-100 text-slate-600',
  sent:     'bg-blue-100 text-blue-700',
  signed:   'bg-emerald-100 text-emerald-700',
  active:   'bg-green-100 text-green-700',
  expired:  'bg-amber-100 text-amber-700',
};
const statusLabels: Record<string, string> = {
  draft: 'Taslak', sent: 'Gönderildi', signed: 'İmzalandı',
  active: 'Aktif', expired: 'Süresi Dolmuş',
};

export default function ContractEngineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('general');
  const [showUpload, setShowUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // ── Queries ─────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['contract-engine-detail', id],
    queryFn: () => contractEngineApi.get(id),
    enabled: !!id,
  });
  const c = (data as any)?.data;

  const { data: filesData } = useQuery({
    queryKey: ['contract-engine-files', id],
    queryFn: () => contractEngineApi.getFiles(id),
    enabled: !!id && activeTab === 'files',
  });
  const files = (filesData as any)?.data || [];

  const { data: statusLogData } = useQuery({
    queryKey: ['contract-engine-status-log', id],
    queryFn: () => contractEngineApi.getStatusLog(id),
    enabled: !!id && activeTab === 'status-log',
  });
  const statusLog = (statusLogData as any)?.data || [];

  // ── Mutations ───────────────────────────────────────────────────────
  const sendMutation = useMutationWithToast(
    () => contractEngineApi.send(id),
    { successMessage: 'Sözleşme gönderildi', invalidateKeys: [['contract-engine-detail', id], ['contract-engine']] },
  );

  const signMutation = useMutationWithToast(
    () => contractEngineApi.sign(id),
    { successMessage: 'Sözleşme imzalandı', invalidateKeys: [['contract-engine-detail', id], ['contract-engine']] },
  );

  const activateMutation = useMutationWithToast(
    () => contractEngineApi.activate(id),
    { successMessage: 'Sözleşme aktifleştirildi', invalidateKeys: [['contract-engine-detail', id], ['contract-engine']] },
  );

  const uploadMutation = useMutationWithToast(
    () => contractEngineApi.uploadSigned(id, selectedFile!),
    {
      successMessage: 'İmzalı belge yüklendi',
      invalidateKeys: [['contract-engine-detail', id], ['contract-engine-files', id], ['contract-engine']],
      onSuccess: () => { setShowUpload(false); setSelectedFile(null); },
    },
  );

  const handleDownloadPdf = async () => {
    try {
      const blob = await contractEngineApi.getPdf(id);
      const url = window.URL.createObjectURL(blob as any);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Sozlesme_${c?.contractNumber || id}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('PDF indirildi');
    } catch {
      toast.error('PDF oluşturulamadı');
    }
  };

  // ── Loading / not found ─────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 skeleton rounded-xl w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 skeleton rounded-xl" />)}
        </div>
        <div className="h-64 skeleton rounded-xl" />
      </div>
    );
  }

  if (!c) {
    return (
      <EmptyState
        icon={<FileCheck className="w-10 h-10" />}
        title="Sözleşme bulunamadı"
        action={<Button onClick={() => router.push('/contract-engine')}>Geri Dön</Button>}
      />
    );
  }

  const currencySymbol = c.currency === 'TRY' ? '₺' : c.currency === 'USD' ? '$' : c.currency === 'EUR' ? '€' : (c.currency || '₺');
  const daysToEnd = c.endDate ? Math.ceil((new Date(c.endDate).getTime() - Date.now()) / 86400000) : null;
  const isNearExpiry = daysToEnd !== null && daysToEnd > 0 && daysToEnd <= 60;

  // Status timeline
  const timelineSteps = [
    { key: 'draft', label: 'Oluşturuldu', date: c.createdAt, icon: FileCheck },
    { key: 'sent', label: 'Gönderildi', date: c.sentAt, icon: Send },
    { key: 'signed', label: 'İmzalandı', date: c.signedAt, icon: PenTool },
    { key: 'active', label: 'Aktifleştirildi', date: c.activatedAt, icon: Zap },
  ];

  const detailTabs = [
    { key: 'general', label: 'Genel Bilgiler' },
    { key: 'preview', label: 'Belge Önizleme' },
    { key: 'files', label: 'Dosyalar' },
    { key: 'status-log', label: 'Durum Geçmişi' },
  ];

  return (
    <>
      {/* Back button */}
      <button
        onClick={() => router.push('/contract-engine')}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Sözleşmeler
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-display font-extrabold text-2xl font-mono text-slate-900 dark:text-slate-100">
              {c.contractNumber}
            </h1>
            <Badge color={statusColors[c.status] || ''} dot>
              {statusLabels[c.status] || c.status}
            </Badge>
            {c.proposalId && (
              <button
                onClick={() => router.push(`/proposals/${c.proposalId}`)}
                className="text-xs bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded-full hover:bg-teal-200 dark:hover:bg-teal-900/60 transition-colors flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                Teklif
              </button>
            )}
            {isNearExpiry && (
              <Badge color="bg-amber-100 text-amber-700">
                <AlertTriangle className="w-3 h-3 mr-1 inline" />
                {daysToEnd} gün kaldı
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-400">
            {c.customer?.name || 'Müşteri'} &mdash; {formatDate(c.startDate)} - {formatDate(c.endDate)}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="outline" size="sm" icon={<Download className="w-4 h-4" />} onClick={handleDownloadPdf}>
            PDF İndir
          </Button>
          <Button variant="outline" size="sm" icon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>
            Yazdır
          </Button>
          {c.status === 'draft' && (
            <Button size="sm" icon={<Send className="w-4 h-4" />} loading={sendMutation.isPending}
              onClick={() => sendMutation.mutate(undefined as any)}>
              Gönder
            </Button>
          )}
          {(c.status === 'draft' || c.status === 'sent') && (
            <Button size="sm" variant="outline" icon={<Upload className="w-4 h-4" />} onClick={() => setShowUpload(true)}>
              İmzalı Belge Yükle
            </Button>
          )}
          {c.status === 'sent' && (
            <Button size="sm" icon={<PenTool className="w-4 h-4" />} loading={signMutation.isPending}
              onClick={() => signMutation.mutate(undefined as any)}>
              İmzala
            </Button>
          )}
          {c.status === 'signed' && (
            <Button size="sm" icon={<Zap className="w-4 h-4" />} loading={activateMutation.isPending}
              onClick={() => activateMutation.mutate(undefined as any)}>
              Aktifleştir
            </Button>
          )}
        </div>
      </div>

      {/* Guided UX banners */}
      {c.status === 'draft' && (
        <div className="mb-4 p-4 bg-slate-800/50 border border-slate-700 rounded-xl flex items-center gap-3">
          <FileText className="w-5 h-5 text-slate-400" />
          <p className="text-sm text-slate-300 flex-1">Sözleşme taslak aşamasında. PDF oluşturup müşteriye gönderin.</p>
          <Button size="sm" variant="outline" onClick={handleDownloadPdf}>PDF Oluştur</Button>
        </div>
      )}
      {c.status === 'sent' && (
        <div className="mb-4 p-4 bg-blue-900/30 border border-blue-700/50 rounded-xl flex items-center gap-3">
          <Clock className="w-5 h-5 text-blue-400" />
          <p className="text-sm text-blue-300 flex-1">Sözleşme müşteriye gönderildi. İmzalı belgeyi yükleyin.</p>
          <Button size="sm" onClick={() => setShowUpload(true)}>İmzalı PDF Yükle →</Button>
        </div>
      )}
      {c.status === 'signed' && (
        <div className="mb-4 p-4 bg-green-900/30 border border-green-700/50 rounded-xl flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-400" />
          <p className="text-sm text-green-300 flex-1">Sözleşme imzalandı. Aktif hale getirerek operasyona devredin.</p>
          <Button size="sm" onClick={() => activateMutation.mutate(undefined as any)}>Aktif Et →</Button>
        </div>
      )}
      {c.status === 'active' && (
        <div className="mb-4 p-4 bg-teal-900/30 border border-teal-700/50 rounded-xl flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-teal-400" />
          <p className="text-sm text-teal-300 flex-1">Sözleşme aktif. İş emri oluşturarak operasyona başlayabilirsiniz.</p>
          <Button size="sm" onClick={() => router.push('/work-orders/new')}>İş Emri Oluştur →</Button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Müşteri"
          value={c.customer?.name || c.customerId?.slice(0, 8) + '...'}
          icon={<Building2 className="w-5 h-5 text-teal-600" />}
          color="bg-teal-50 dark:bg-teal-950/40"
        />
        <StatCard
          label="Toplam Tutar"
          value={`${currencySymbol}${Number(c.totalAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
          icon={<DollarSign className="w-5 h-5 text-emerald-600" />}
          color="bg-emerald-50 dark:bg-emerald-950/40"
        />
        <StatCard
          label="Başlangıç"
          value={formatDate(c.startDate)}
          icon={<Calendar className="w-5 h-5 text-blue-600" />}
          color="bg-blue-50 dark:bg-blue-950/40"
        />
        <StatCard
          label="Bitiş"
          value={formatDate(c.endDate)}
          icon={<Clock className="w-5 h-5 text-amber-600" />}
          color="bg-amber-50 dark:bg-amber-950/40"
        />
      </div>

      {/* Status timeline */}
      <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between">
          {timelineSteps.map((step, idx) => {
            const hasDate = !!step.date;
            const isCurrent = step.key === c.status;
            const Icon = step.icon;
            return (
              <div key={step.key} className="flex items-center flex-1 last:flex-initial">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    hasDate ? 'bg-green-100 dark:bg-green-900/40'
                      : isCurrent ? 'bg-teal-600' : 'bg-slate-200 dark:bg-slate-700'
                  }`}>
                    <Icon className={`w-4 h-4 ${
                      hasDate ? 'text-green-600' : isCurrent ? 'text-white' : 'text-slate-400'
                    }`} />
                  </div>
                  <p className={`text-xs mt-1 ${hasDate ? 'text-slate-700 dark:text-slate-300 font-semibold' : 'text-slate-400'}`}>
                    {step.label}
                  </p>
                  {step.date && <p className="text-xs text-slate-400">{formatDate(step.date)}</p>}
                </div>
                {idx < timelineSteps.length - 1 && (
                  <div className={`flex-1 h-px mx-3 ${hasDate ? 'bg-green-300 dark:bg-green-700' : 'bg-slate-200 dark:bg-slate-700'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <Tabs tabs={detailTabs} active={activeTab} onChange={setActiveTab} />
      </div>

      {/* Tab Content */}
      {activeTab === 'general' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <Card>
              <CardHeader><CardTitle>Sözleşme Bilgileri</CardTitle></CardHeader>

              {/* Customer Info */}
              {c.customer && (
                <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Müşteri</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">{c.customer.name}</p>
                  {c.customer.contactName && <p className="text-sm text-slate-500">{c.customer.contactName}</p>}
                  {c.customer.email && <p className="text-sm text-slate-400">{c.customer.email}</p>}
                  {c.customer.city && <p className="text-sm text-slate-400">{c.customer.city}</p>}
                </div>
              )}

              {/* Dates & amounts */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-xs text-slate-400 mb-1">Başlangıç Tarihi</p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{formatDate(c.startDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Bitiş Tarihi</p>
                  <p className={`text-sm font-medium ${isNearExpiry ? 'text-amber-600' : 'text-slate-700 dark:text-slate-300'}`}>
                    {formatDate(c.endDate)}
                    {isNearExpiry && <span className="text-xs ml-1">({daysToEnd} gün kaldı)</span>}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Toplam Tutar</p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {currencySymbol}{Number(c.totalAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Para Birimi</p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{c.currency || 'TRY'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Oluşturulma</p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{formatDateTime(c.createdAt)}</p>
                </div>
                {c.proposalId && (
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Bağlı Teklif</p>
                    <button
                      onClick={() => router.push(`/proposals/${c.proposalId}`)}
                      className="text-sm font-medium text-teal-600 hover:underline"
                    >
                      {c.proposalNumber || 'Teklifi Görüntüle'}
                    </button>
                  </div>
                )}
              </div>

              {/* Special conditions */}
              {c.specialConditions && (
                <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950/20 rounded-xl text-sm text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  <p className="font-semibold mb-1">Özel Koşullar</p>
                  <p>{c.specialConditions}</p>
                </div>
              )}

              {/* Terms */}
              {c.terms && (
                <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-sm text-slate-600 dark:text-slate-400">
                  <p className="font-semibold mb-1 text-slate-700 dark:text-slate-300">Sözleşme Şartları</p>
                  <p className="whitespace-pre-wrap">{c.terms}</p>
                </div>
              )}

              {/* Notes */}
              {c.notes && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm text-slate-600 dark:text-slate-400">
                  <strong>Notlar:</strong> {c.notes}
                </div>
              )}
            </Card>
          </div>

          {/* Side panel */}
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Özet</CardTitle></CardHeader>
              <div className="space-y-3 text-sm">
                {[
                  { label: 'Durum', value: statusLabels[c.status] || c.status },
                  { label: 'Müşteri', value: c.customer?.name || '—', link: c.customerId ? `/customers/${c.customerId}` : undefined },
                  { label: 'Başlangıç', value: formatDate(c.startDate) },
                  { label: 'Bitiş', value: formatDate(c.endDate) },
                  { label: 'Para Birimi', value: c.currency || 'TRY' },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between">
                    <span className="text-slate-400">{row.label}</span>
                    {(row as any).link ? (
                      <button className="text-teal-600 hover:underline text-sm" onClick={() => router.push((row as any).link)}>
                        {row.value}
                      </button>
                    ) : (
                      <span className="text-slate-700 dark:text-slate-300">{row.value}</span>
                    )}
                  </div>
                ))}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between">
                  <span className="text-slate-400 font-semibold">Toplam</span>
                  <span className="font-bold text-lg text-teal-600">
                    {currencySymbol}{Number(c.totalAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </Card>

            {/* Status info cards */}
            {c.activatedAt && (
              <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-xl text-sm text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
                <Zap className="w-4 h-4 flex-shrink-0" />
                <div>
                  <p className="font-semibold">Aktif</p>
                  <p className="text-xs text-green-600 dark:text-green-400">{formatDateTime(c.activatedAt)}</p>
                </div>
              </div>
            )}
            {c.signedAt && !c.activatedAt && (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl text-sm text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <PenTool className="w-4 h-4 flex-shrink-0" />
                <div>
                  <p className="font-semibold">İmzalandı</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">{formatDateTime(c.signedAt)}</p>
                </div>
              </div>
            )}
            {c.sentAt && !c.signedAt && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl text-sm text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                <Send className="w-4 h-4 flex-shrink-0" />
                <div>
                  <p className="font-semibold">Gönderildi</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">{formatDateTime(c.sentAt)}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'preview' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>Sözleşme Belgesi</CardTitle>
            <div className="flex gap-2">
              {c?.pdfUrl && (
                <Button
                  variant="outline" size="sm"
                  icon={<Download className="w-4 h-4" />}
                  onClick={async () => {
                    try {
                      const res = await contractEngineApi.getDocument(id);
                      const blob = new Blob([res as any], { type: 'application/octet-stream' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url;
                      a.download = c.pdfUrl?.includes('.docx') ? `sozlesme-${c.contractNumber}.docx` : `sozlesme-${c.contractNumber}.pdf`;
                      a.click(); URL.revokeObjectURL(url);
                    } catch { toast.error('Indirme hatasi'); }
                  }}
                >
                  Belgeyi İndir
                </Button>
              )}
              <Button size="sm" icon={<Upload className="w-4 h-4" />} onClick={() => setShowUpload(true)}>
                Belge Yükle
              </Button>
            </div>
          </div>

          {c?.pdfUrl ? (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Badge color={c.pdfUrl.includes('.docx') ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}>
                  {c.pdfUrl.includes('.docx') ? 'Word (.docx)' : 'PDF'}
                </Badge>
                <span className="text-xs text-slate-400">{c.pdfUrl.replace('local://', '')}</span>
              </div>

              {c.pdfUrl.includes('.pdf') ? (
                <iframe
                  src={`${process.env.NEXT_PUBLIC_API_URL}/contract-engine/${id}/document`}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700"
                  style={{ height: '80vh' }}
                  title="Sözleşme Önizleme"
                />
              ) : (
                <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-12 text-center">
                  <FileText className="w-16 h-16 text-blue-400 mx-auto mb-4" />
                  <p className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">
                    Word Belgesi Yüklendi
                  </p>
                  <p className="text-sm text-slate-500 mb-4">
                    {c.contractNumber} - {c.title || 'Sözleşme'}
                  </p>
                  <Button
                    icon={<Download className="w-4 h-4" />}
                    onClick={async () => {
                      try {
                        const res = await contractEngineApi.getDocument(id);
                        const blob = new Blob([res as any], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a'); a.href = url;
                        a.download = `sozlesme-${c.contractNumber}.docx`;
                        a.click(); URL.revokeObjectURL(url);
                      } catch { toast.error('Indirme hatasi'); }
                    }}
                  >
                    Word Belgesini İndir
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon={<FileText className="w-12 h-12" />}
              title="Belge yüklenmemiş"
              description="Sözleşme belgesini Word veya PDF olarak yükleyebilirsiniz"
            />
          )}
        </Card>
      )}

      {activeTab === 'files' && (
        <Card>
          <CardHeader>
            <CardTitle>Dosyalar ({files.length})</CardTitle>
            <Button size="sm" icon={<Upload className="w-4 h-4" />} onClick={() => setShowUpload(true)}>
              Belge Yükle
            </Button>
          </CardHeader>
          {files.length === 0 ? (
            <EmptyState
              icon={<File className="w-10 h-10" />}
              title="Henüz dosya yüklenmedi"
              description="İmzalı sözleşme belgesini yükleyerek başlayın."
              action={<Button size="sm" icon={<Upload className="w-4 h-4" />} onClick={() => setShowUpload(true)}>Belge Yükle</Button>}
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 dark:border-slate-700">
                  <th className="text-left py-2 text-slate-500">#</th>
                  <th className="text-left py-2 text-slate-500">Dosya Adı</th>
                  <th className="text-left py-2 text-slate-500">Tür</th>
                  <th className="text-left py-2 text-slate-500">Versiyon</th>
                  <th className="text-left py-2 text-slate-500">Yüklenme Tarihi</th>
                  <th className="text-right py-2 text-slate-500">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file: any, i: number) => (
                  <tr key={file.id || i} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2.5 text-slate-400">{i + 1}</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <File className="w-4 h-4 text-slate-400" />
                        <span className="text-slate-700 dark:text-slate-300">{file.fileName || file.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-slate-500">{file.fileType || file.type || 'PDF'}</td>
                    <td className="py-2.5">
                      <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-slate-600 dark:text-slate-400">
                        v{file.version || 1}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-500">{formatDateTime(file.createdAt || file.uploadedAt)}</td>
                    <td className="py-2.5 text-right">
                      {file.url && (
                        <a href={file.url} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-teal-600 inline-block">
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {activeTab === 'status-log' && (
        <Card>
          <CardHeader><CardTitle>Durum Geçmişi</CardTitle></CardHeader>
          {statusLog.length === 0 ? (
            <EmptyState icon={<Clock className="w-10 h-10" />} title="Henüz durum geçmişi yok" />
          ) : (
            <div className="space-y-4">
              {statusLog.map((log: any, i: number) => (
                <div key={log.id || i} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full mt-1.5 ${
                      log.toStatus === 'active' ? 'bg-green-500' :
                      log.toStatus === 'signed' ? 'bg-emerald-500' :
                      log.toStatus === 'sent' ? 'bg-blue-500' :
                      'bg-slate-400'
                    }`} />
                    {i < statusLog.length - 1 && <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700 mt-1" />}
                  </div>
                  <div className="pb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge color={statusColors[log.toStatus] || 'bg-slate-100 text-slate-500'}>
                        {statusLabels[log.toStatus] || log.toStatus}
                      </Badge>
                      {log.fromStatus && (
                        <span className="text-xs text-slate-400">
                          {statusLabels[log.fromStatus] || log.fromStatus} &rarr;
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">{formatDateTime(log.createdAt)}</p>
                    {log.performedBy && <p className="text-xs text-slate-500 mt-0.5">Yapan: {log.performedBy}</p>}
                    {log.note && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{log.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Upload Modal */}
      <Modal
        open={showUpload}
        onClose={() => { setShowUpload(false); setSelectedFile(null); }}
        title="İmzalı Sözleşme Belgesi Yükle"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowUpload(false); setSelectedFile(null); }}>İptal</Button>
            <Button loading={uploadMutation.isPending} disabled={!selectedFile}
              onClick={() => uploadMutation.mutate(undefined as any)}>
              Yükle
            </Button>
          </>
        }
      >
        <div
          className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-teal-400 transition-colors"
          onClick={() => document.getElementById('ce-detail-upload')?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) {
              if (!file.name.toLowerCase().endsWith('.pdf')) {
                toast.error('Sadece PDF dosyası yüklenebilir');
                return;
              }
              if (file.size > 20 * 1024 * 1024) {
                toast.error('Dosya boyutu 20MB\'dan küçük olmalıdır');
                return;
              }
              setSelectedFile(file);
            }
          }}
        >
          <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          {selectedFile ? (
            <div>
              <p className="text-sm font-semibold text-teal-600">{selectedFile.name}</p>
              <p className="text-xs text-slate-400 mt-1">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-500">İmzalı PDF belgeyi sürükleyin veya seçin</p>
              <p className="text-xs text-slate-400 mt-1">PDF, maks. 20MB</p>
            </>
          )}
          <input
            id="ce-detail-upload"
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                if (!file.name.toLowerCase().endsWith('.pdf')) {
                  toast.error('Sadece PDF dosyası yüklenebilir');
                  e.target.value = '';
                  return;
                }
                if (file.size > 20 * 1024 * 1024) {
                  toast.error('Dosya boyutu 20MB\'dan küçük olmalıdır');
                  e.target.value = '';
                  return;
                }
                setSelectedFile(file);
              }
            }}
          />
        </div>
      </Modal>
    </>
  );
}
