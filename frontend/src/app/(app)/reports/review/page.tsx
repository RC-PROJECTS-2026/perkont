'use client';
import { useState } from 'react';
import { useReports, reportsApi, useMutationWithToast } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, Modal, Textarea,
  SkeletonTable, EmptyState, Tabs,
} from '@/components/ui';
import { REPORT_STATUS_LABELS, formatDate } from '@/lib/utils';
import { FileText, Check, RotateCcw, Pen, Download, Eye, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ReportsReviewPage() {
  const [tab, setTab] = useState('under_review');
  const [selected, setSelected] = useState<any>(null);
  const [action, setAction] = useState<'approve' | 'revision' | 'sign' | null>(null);
  const [comment, setComment] = useState('');
  const [signPhone, setSignPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [signSession, setSignSession] = useState<string | null>(null);

  const { data, isLoading, refetch } = useReports({ status: tab, limit: 50 });
  const reports = (data as any)?.data?.data || [];

  const approveMutation = useMutationWithToast(
    ({ id, comment }: any) => reportsApi.approve(id, comment),
    { successMessage: 'Rapor onaylandı', invalidateKeys: [['reports']], onSuccess: () => { setAction(null); setSelected(null); setComment(''); } },
  );

  const revisionMutation = useMutationWithToast(
    ({ id, comment }: any) => reportsApi.requestRevision(id, comment),
    { successMessage: 'Revizyon talebi gönderildi', invalidateKeys: [['reports']], onSuccess: () => { setAction(null); setSelected(null); setComment(''); } },
  );

  const initiateSignMutation = useMutationWithToast(
    ({ id, phone }: any) => reportsApi.initiateSign(id, phone),
    {
      onSuccess: (res: any) => {
        setSignSession(res.data.sessionId);
        toast.success(res.data.message);
      },
    },
  );

  const completeSignMutation = useMutationWithToast(
    ({ id, sessionId, otpCode, signerName }: any) =>
      reportsApi.completeSigning(id, { sessionId, otpCode, signerName }),
    {
      successMessage: 'Rapor başarıyla imzalandı!',
      invalidateKeys: [['reports']],
      onSuccess: () => { setAction(null); setSelected(null); setSignSession(null); },
    },
  );

  const downloadPdf = async (reportId: string, signed = false) => {
    try {
      const blob = await reportsApi.getPdf(reportId, signed);
      const url = URL.createObjectURL(blob as any);
      const a = document.createElement('a');
      a.href = url; a.download = `rapor-${reportId}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('PDF indirilemedi');
    }
  };

  const tabs = [
    { key: 'under_review',       label: 'İnceleme Bekliyor' },
    { key: 'revision_requested', label: 'Revizyon' },
    { key: 'approved',           label: 'Onaylı' },
    { key: 'under_signing',      label: 'İmzalanıyor' },
    { key: 'signed',             label: 'İmzalandı' },
    { key: 'delivered',          label: 'Teslim Edildi' },
  ];

  return (
    <>
      <PageHeader
        title="Rapor İnceleme"
        subtitle="Teknik yönetici onay kuyruğu"
        actions={<Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>}
      />

      <div className="mb-4">
        <Tabs tabs={tabs} active={tab} onChange={(k) => { setTab(k); }} />
      </div>

      <Card padding="none">
        {isLoading ? (
          <SkeletonTable rows={6} cols={6} />
        ) : reports.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-12 h-12" />}
            title="Bu durumda rapor yok"
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Rapor No</th>
                <th>Ekipman</th>
                <th>Müşteri</th>
                <th>Form Revizyonu</th>
                <th>Tarih</th>
                <th>Durum</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r: any) => {
                const statusInfo = REPORT_STATUS_LABELS[r.status] || { label: r.status, color: '' };
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">{r.reportNumber}</span>
                    </td>
                    <td><span className="text-sm text-slate-600">{r.equipmentId}</span></td>
                    <td><span className="text-sm text-slate-600">{r.customerId}</span></td>
                    <td>
                      <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded font-mono">{r.formTemplateRevision}</span>
                    </td>
                    <td><span className="text-sm text-slate-500">{formatDate(r.createdAt)}</span></td>
                    <td><Badge color={statusInfo.color}>{statusInfo.label}</Badge></td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => downloadPdf(r.id)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
                          title="PDF İndir"
                        >
                          <Download className="w-4 h-4" />
                        </button>

                        {r.status === 'under_review' && (
                          <>
                            <button
                              onClick={() => { setSelected(r); setAction('approve'); }}
                              className="p-1.5 rounded-lg hover:bg-green-50 text-slate-400 hover:text-green-600"
                              title="Onayla"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => { setSelected(r); setAction('revision'); }}
                              className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600"
                              title="Revizyon İste"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          </>
                        )}

                        {r.status === 'approved' && (
                          <button
                            onClick={() => { setSelected(r); setAction('sign'); }}
                            className="p-1.5 rounded-lg hover:bg-teal-50 text-slate-400 hover:text-teal-600"
                            title="İmzala"
                          >
                            <Pen className="w-4 h-4" />
                          </button>
                        )}

                        {(r.status === 'signed' || r.status === 'delivered') && (
                          <button
                            onClick={() => downloadPdf(r.id, true)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                            title="İmzalı PDF"
                          >
                            <Eye className="w-4 h-4" />
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

      {/* Approve Modal */}
      <Modal
        open={action === 'approve'}
        onClose={() => { setAction(null); setComment(''); }}
        title="Raporu Onayla"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setAction(null); setComment(''); }}>İptal</Button>
            <Button
              loading={approveMutation.isPending}
              onClick={() => approveMutation.mutate({ id: selected?.id, comment })}
            >
              Onayla
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          <strong>{selected?.reportNumber}</strong> nolu raporu onaylıyorsunuz.
        </p>
        <Textarea
          label="Onay Notu (opsiyonel)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="İnceleme notu..."
          rows={3}
        />
      </Modal>

      {/* Revision Modal */}
      <Modal
        open={action === 'revision'}
        onClose={() => { setAction(null); setComment(''); }}
        title="Revizyon Talep Et"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setAction(null); setComment(''); }}>İptal</Button>
            <Button
              variant="danger"
              loading={revisionMutation.isPending}
              onClick={() => revisionMutation.mutate({ id: selected?.id, comment })}
            >
              Gönder
            </Button>
          </>
        }
      >
        <Textarea
          label="Revizyon Notu *"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Düzeltilmesi gereken noktaları yazınız..."
          rows={4}
          required
        />
      </Modal>

      {/* Sign Modal */}
      <Modal
        open={action === 'sign'}
        onClose={() => { setAction(null); setSignSession(null); setOtpCode(''); setSignPhone(''); }}
        title="Raporu E-İmzayla İmzala"
        size="sm"
        footer={
          signSession ? (
            <>
              <Button variant="secondary" onClick={() => setSignSession(null)}>Geri</Button>
              <Button
                loading={completeSignMutation.isPending}
                onClick={() => completeSignMutation.mutate({
                  id: selected?.id,
                  sessionId: signSession,
                  otpCode,
                  signerName: 'Teknik Yönetici',
                })}
              >
                İmzalamayı Tamamla
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setAction(null)}>İptal</Button>
              <Button
                loading={initiateSignMutation.isPending}
                onClick={() => initiateSignMutation.mutate({ id: selected?.id, phone: signPhone })}
              >
                OTP Gönder
              </Button>
            </>
          )
        }
      >
        {!signSession ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              <strong>{selected?.reportNumber}</strong> nolu raporu e-imzayla imzalamak için telefon numaranızı doğrulayın.
            </p>
            <input
              type="tel"
              value={signPhone}
              onChange={(e) => setSignPhone(e.target.value)}
              placeholder="+90 5XX XXX XX XX"
              className="w-full px-3 py-2 h-9 rounded-lg border border-slate-300 dark:border-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-teal-50 dark:bg-teal-950/30 rounded-xl text-sm text-teal-700 dark:text-teal-300">
              Telefonunuza SMS ile doğrulama kodu gönderildi.
            </div>
            <input
              type="text"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              placeholder="6 haneli kod"
              maxLength={6}
              className="w-full px-3 py-2 h-9 rounded-lg border border-slate-300 text-sm text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            />
          </div>
        )}
      </Modal>
    </>
  );
}
