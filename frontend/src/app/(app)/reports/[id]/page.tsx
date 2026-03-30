'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { reportsApi, useMutationWithToast } from '@/lib/api';
import {
  Card, CardHeader, CardTitle, Badge, Button,
  Textarea, Modal, EmptyState, Input, StatCard,
} from '@/components/ui';
import { REPORT_STATUS_LABELS, formatDate, formatDateTime } from '@/lib/utils';
import {
  FileText, Download, Pen, CheckCircle2, RotateCcw,
  Send, Shield, ArrowLeft, ExternalLink, Hash,
  Clock, User, Package, Eye, Truck,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [approveModal, setApproveModal] = useState(false);
  const [revisionModal, setRevisionModal] = useState(false);
  const [signModal, setSignModal] = useState(false);
  const [comment, setComment] = useState('');
  const [signPhone, setSignPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [signSession, setSignSession] = useState<string | null>(null);

  // ── Query ─────────────────────────────────────────────────────────────
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['report', id],
    queryFn: () => reportsApi.get(id),
    enabled: !!id,
  });

  const report = (data as any)?.data;

  // ── Mutations ─────────────────────────────────────────────────────────
  const approveMutation = useMutationWithToast(
    ({ comment }: any) => reportsApi.approve(id, comment),
    {
      successMessage: 'Rapor onaylandi',
      invalidateKeys: [['report', id]],
      onSuccess: () => {
        setApproveModal(false);
        setComment('');
      },
    },
  );
  const revisionMutation = useMutationWithToast(
    ({ comment }: any) => reportsApi.requestRevision(id, comment),
    {
      successMessage: 'Revizyon talebi gonderildi',
      invalidateKeys: [['report', id]],
      onSuccess: () => {
        setRevisionModal(false);
        setComment('');
      },
    },
  );
  const initiateSignMutation = useMutationWithToast(
    (phone: string) => reportsApi.initiateSign(id, phone),
    {
      onSuccess: (res: any) => {
        setSignSession(res?.data?.sessionId);
        toast.success(res?.data?.message || 'OTP gonderildi');
      },
    },
  );
  const completeSignMutation = useMutationWithToast(
    () =>
      reportsApi.completeSigning(id, {
        sessionId: signSession,
        otpCode,
        signerName: 'Teknik Yonetici',
      }),
    {
      successMessage: 'Rapor basariyla imzalandi',
      invalidateKeys: [['report', id]],
      onSuccess: () => {
        setSignModal(false);
        setSignSession(null);
        setOtpCode('');
      },
    },
  );
  const deliverMutation = useMutationWithToast(
    () => reportsApi.deliver(id),
    {
      successMessage: 'Rapor teslim edildi',
      invalidateKeys: [['report', id]],
    },
  );

  // ── PDF download ──────────────────────────────────────────────────────
  const downloadPdf = async (signed = false) => {
    try {
      const blob = await reportsApi.getPdf(id, signed);
      const url = URL.createObjectURL(blob as any);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report?.reportNumber}${signed ? '_IMZALI' : ''}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('PDF indirilemedi');
    }
  };

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
          <div className="h-64 skeleton rounded-xl" />
        </div>
      </>
    );
  }

  if (!report) {
    return (
      <>
        <EmptyState
          icon={<FileText className="w-10 h-10" />}
          title="Rapor bulunamadi"
          action={<Button onClick={() => router.push('/reports')}>Geri Don</Button>}
        />
      </>
    );
  }

  const statusInfo = REPORT_STATUS_LABELS[report.status] || {
    label: report.status,
    color: '',
  };

  // ── Status timeline ───────────────────────────────────────────────────
  const statusSteps = [
    { key: 'draft', label: 'Taslak', date: report.createdAt },
    { key: 'under_review', label: 'Incelemede', date: report.submittedAt },
    { key: 'approved', label: 'Onaylandi', date: report.approvedAt },
    { key: 'signed', label: 'Imzalandi', date: report.signedAt },
    { key: 'delivered', label: 'Teslim Edildi', date: report.deliveredAt },
  ];
  const currentStepIdx = statusSteps.findIndex((s) => s.key === report.status);

  return (
    <>
      <button
        onClick={() => router.push('/reports')}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Raporlar
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="font-display font-extrabold text-2xl text-slate-900 dark:text-slate-100 font-mono tracking-tight">
              {report.reportNumber}
            </h1>
            <Badge color={statusInfo.color} dot>
              {statusInfo.label}
            </Badge>
          </div>
          <p className="text-sm text-slate-400">
            Form Rev:{' '}
            <span className="font-mono">{report.formTemplateRevision}</span>
            {' - '}Olusturulma: {formatDate(report.createdAt)}
            {report.version && ` - v${report.version}`}
          </p>
        </div>

        <div className="flex gap-2">
          {/* PDF download buttons */}
          {report.pdfUrl && (
            <Button
              variant="outline"
              size="sm"
              icon={<Download className="w-4 h-4" />}
              onClick={() => downloadPdf(false)}
            >
              Ham PDF
            </Button>
          )}
          {(report.status === 'signed' || report.status === 'delivered') &&
            report.signedPdfUrl && (
              <Button
                variant="outline"
                size="sm"
                icon={<Shield className="w-4 h-4" />}
                onClick={() => downloadPdf(true)}
              >
                Imzali PDF
              </Button>
            )}

          {/* Action buttons based on status */}
          {report.status === 'under_review' && (
            <>
              <Button
                size="sm"
                icon={<CheckCircle2 className="w-4 h-4" />}
                onClick={() => setApproveModal(true)}
              >
                Onayla
              </Button>
              <Button
                size="sm"
                variant="outline"
                icon={<RotateCcw className="w-4 h-4" />}
                onClick={() => setRevisionModal(true)}
              >
                Iade Et
              </Button>
            </>
          )}
          {report.status === 'approved' && (
            <Button
              size="sm"
              icon={<Pen className="w-4 h-4" />}
              onClick={() => setSignModal(true)}
            >
              E-Imza Baslat
            </Button>
          )}
          {report.status === 'signed' && (
            <Button
              size="sm"
              icon={<Send className="w-4 h-4" />}
              loading={deliverMutation.isPending}
              onClick={() => deliverMutation.mutate(undefined as any)}
            >
              Musteriye Teslim Et
            </Button>
          )}
        </div>
      </div>

      {/* Status timeline */}
      <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between">
          {statusSteps.map((step, idx) => {
            const isPast = idx <= currentStepIdx;
            const isCurrent = idx === currentStepIdx;
            const isRevision = report.status === 'revision_requested' && idx === 1;
            return (
              <div key={step.key} className="flex items-center flex-1 last:flex-initial">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                      isRevision
                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40'
                        : isCurrent
                        ? 'bg-teal-600 text-white'
                        : isPast
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                        : 'bg-slate-200 text-slate-400 dark:bg-slate-700'
                    }`}
                  >
                    {isPast && !isCurrent ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <p
                    className={`text-xs mt-1 ${
                      isCurrent
                        ? 'text-teal-600 font-semibold'
                        : isPast
                        ? 'text-green-600'
                        : 'text-slate-400'
                    }`}
                  >
                    {isRevision ? 'Revizyon' : step.label}
                  </p>
                  {step.date && isPast && (
                    <p className="text-xs text-slate-300 dark:text-slate-600">
                      {formatDate(step.date)}
                    </p>
                  )}
                </div>
                {idx < statusSteps.length - 1 && (
                  <div
                    className={`flex-1 h-px mx-2 ${
                      idx < currentStepIdx
                        ? 'bg-green-300 dark:bg-green-700'
                        : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* QR Verify link */}
      {(report.status === 'signed' || report.status === 'delivered') && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl">
          <Shield className="w-5 h-5 text-green-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-800 dark:text-green-300">
              Bu rapor e-imzayla imzalanmistir
            </p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
              Imzalanma: {formatDateTime(report.signedAt)}
              {report.signatureData?.signerName &&
                ` - ${report.signatureData.signerName}`}
            </p>
          </div>
          <a
            href={`/reports/verify/${report.reportNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-300 hover:underline"
          >
            Dogrula <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Delivery info */}
      {report.status === 'delivered' && report.deliveredAt && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-xl">
          <Truck className="w-5 h-5 text-teal-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-teal-800 dark:text-teal-300">
              Musteriye teslim edildi
            </p>
            <p className="text-xs text-teal-600 dark:text-teal-400 mt-0.5">
              Teslim tarihi: {formatDateTime(report.deliveredAt)}
              {report.deliveryMethod && ` - Yontem: ${report.deliveryMethod}`}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Report info */}
        <Card>
          <CardHeader><CardTitle>Rapor Bilgileri</CardTitle></CardHeader>
          <div className="space-y-3 text-sm">
            {[
              { label: 'Rapor No', value: report.reportNumber, mono: true },
              { label: 'Form Rev.', value: report.formTemplateRevision, mono: true },
              { label: 'Versiyon', value: report.version ? `v${report.version}` : undefined },
              {
                label: 'Denetim',
                value: report.inspectionId?.slice(0, 12) + '...',
                mono: true,
                link: report.inspectionId
                  ? `/inspections/${report.inspectionId}`
                  : undefined,
              },
              {
                label: 'Ekipman',
                value:
                  report.equipment?.inventoryCode ||
                  report.equipmentId?.slice(0, 8) + '...',
                link: report.equipmentId
                  ? `/equipment/${report.equipmentId}`
                  : undefined,
              },
              {
                label: 'Musteri',
                value: report.customer?.name || report.equipment?.customer?.name,
              },
              { label: 'Olusturulma', value: formatDateTime(report.createdAt) },
              { label: 'Imzalanma', value: formatDateTime(report.signedAt) },
              { label: 'Teslim', value: formatDateTime(report.deliveredAt) },
            ].map(
              (row) =>
                row.value && (
                  <div key={row.label} className="flex items-start gap-3">
                    <span className="w-28 text-slate-400 flex-shrink-0">
                      {row.label}
                    </span>
                    {(row as any).link ? (
                      <button
                        className={`text-teal-600 hover:underline break-all ${
                          (row as any).mono
                            ? 'font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded'
                            : 'text-sm'
                        }`}
                        onClick={() => router.push((row as any).link)}
                      >
                        {row.value}
                      </button>
                    ) : (
                      <span
                        className={`text-slate-700 dark:text-slate-300 break-all ${
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

            {/* Document hash */}
            {report.documentHash && (
              <div className="flex items-start gap-3">
                <span className="w-28 text-slate-400 flex-shrink-0">Belge Hash</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300 break-all">
                    {report.documentHash.slice(0, 24)}...
                  </span>
                  <button
                    className="text-xs text-teal-600 hover:underline"
                    onClick={() => {
                      navigator.clipboard.writeText(report.documentHash);
                      toast.success('Hash kopyalandi');
                    }}
                  >
                    Kopyala
                  </button>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Review history */}
        <Card>
          <CardHeader><CardTitle>Onay Gecmisi</CardTitle></CardHeader>
          <div className="space-y-3">
            {(!report.reviewHistory || report.reviewHistory.length === 0) ? (
              <p className="text-sm text-slate-400 text-center py-4">
                Henuz onay islemi yapilmamis
              </p>
            ) : (
              report.reviewHistory.map((h: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 pb-3 border-b border-slate-100 dark:border-slate-800 last:border-0 last:pb-0"
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                      h.action === 'approved'
                        ? 'bg-green-100 dark:bg-green-900/40'
                        : h.action === 'revision_requested'
                        ? 'bg-amber-100 dark:bg-amber-900/40'
                        : h.action === 'signed'
                        ? 'bg-blue-100 dark:bg-blue-900/40'
                        : h.action === 'delivered'
                        ? 'bg-teal-100 dark:bg-teal-900/40'
                        : 'bg-slate-100 dark:bg-slate-800'
                    }`}
                  >
                    {h.action === 'approved' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                    ) : h.action === 'revision_requested' ? (
                      <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                    ) : h.action === 'signed' ? (
                      <Pen className="w-3.5 h-3.5 text-blue-600" />
                    ) : h.action === 'delivered' ? (
                      <Send className="w-3.5 h-3.5 text-teal-600" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {h.action === 'approved'
                        ? 'Onaylandi'
                        : h.action === 'revision_requested'
                        ? 'Revizyon Istendi'
                        : h.action === 'signed'
                        ? 'Imzalandi'
                        : h.action === 'delivered'
                        ? 'Teslim Edildi'
                        : h.action}
                    </p>
                    {h.reviewer && (
                      <p className="text-xs text-slate-400">{h.reviewer}</p>
                    )}
                    {h.comment && (
                      <p className="text-xs text-slate-500 mt-0.5 bg-slate-50 dark:bg-slate-800 p-2 rounded-lg">
                        {h.comment}
                      </p>
                    )}
                    <p className="text-xs text-slate-300 dark:text-slate-600 mt-0.5">
                      {formatDateTime(h.timestamp)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* E-signature info */}
        {report.signatureData && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-4 h-4" /> E-Imza Bilgileri
              </CardTitle>
            </CardHeader>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {[
                { label: 'Imzalayan', value: report.signatureData.signerName },
                {
                  label: 'Imza Zamani',
                  value: formatDateTime(report.signatureData.signTime),
                },
                { label: 'Algoritma', value: report.signatureData.algorithm },
                { label: 'Saglayici', value: report.signatureData.provider },
                {
                  label: 'Sertifika No',
                  value: report.signatureData.certificateNo,
                },
                {
                  label: 'Sertifika Sahibi',
                  value: report.signatureData.certificateSubject,
                },
              ].map((row) => (
                <div key={row.label}>
                  <p className="text-slate-400 text-xs mb-1">{row.label}</p>
                  <p className="text-slate-700 dark:text-slate-300 font-medium">
                    {row.value || '—'}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* PDF preview */}
        {report.pdfUrl && (
          <Card className="md:col-span-2">
            <CardHeader><CardTitle>PDF Onizleme</CardTitle></CardHeader>
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white">
              <iframe
                src={report.pdfUrl}
                className="w-full h-[600px]"
                title="Rapor PDF"
              />
            </div>
          </Card>
        )}
      </div>

      {/* Approve Modal */}
      <Modal
        open={approveModal}
        onClose={() => {
          setApproveModal(false);
          setComment('');
        }}
        title="Raporu Onayla"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setApproveModal(false)}>
              Iptal
            </Button>
            <Button
              loading={approveMutation.isPending}
              onClick={() => approveMutation.mutate({ comment })}
            >
              Onayla
            </Button>
          </>
        }
      >
        <Textarea
          label="Onay Notu (opsiyonel)"
          value={comment}
          onChange={(e: any) => setComment(e.target.value)}
          placeholder="..."
          rows={3}
        />
      </Modal>

      {/* Revision Modal */}
      <Modal
        open={revisionModal}
        onClose={() => {
          setRevisionModal(false);
          setComment('');
        }}
        title="Revizyon Iste"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRevisionModal(false)}>
              Iptal
            </Button>
            <Button
              variant="danger"
              loading={revisionMutation.isPending}
              onClick={() => revisionMutation.mutate({ comment })}
            >
              Gonder
            </Button>
          </>
        }
      >
        <Textarea
          label="Revizyon Notu *"
          value={comment}
          onChange={(e: any) => setComment(e.target.value)}
          rows={4}
          required
        />
      </Modal>

      {/* Sign Modal */}
      <Modal
        open={signModal}
        onClose={() => {
          setSignModal(false);
          setSignSession(null);
          setSignPhone('');
          setOtpCode('');
        }}
        title="E-Imzayla Imzala"
        size="sm"
        footer={
          signSession ? (
            <>
              <Button variant="secondary" onClick={() => setSignSession(null)}>
                Geri
              </Button>
              <Button
                loading={completeSignMutation.isPending}
                disabled={otpCode.length !== 6}
                onClick={() => completeSignMutation.mutate(undefined as any)}
              >
                Tamamla
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setSignModal(false)}>
                Iptal
              </Button>
              <Button
                loading={initiateSignMutation.isPending}
                disabled={!signPhone}
                onClick={() => initiateSignMutation.mutate(signPhone)}
              >
                OTP Gonder
              </Button>
            </>
          )
        }
      >
        {!signSession ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Telefon numaraniza SMS dogrulama kodu gonderilecek.
            </p>
            <Input
              label="Telefon Numarasi"
              type="tel"
              value={signPhone}
              onChange={(e: any) => setSignPhone(e.target.value)}
              placeholder="+905001234567"
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 bg-teal-50 dark:bg-teal-950/30 rounded-xl text-sm text-teal-700 dark:text-teal-300">
              SMS ile dogrulama kodu gonderildi.
            </div>
            <input
              type="text"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              placeholder="000000"
              maxLength={6}
              className="w-full px-3 py-2 h-12 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 text-2xl text-center tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            />
          </div>
        )}
      </Modal>
    </>
  );
}
