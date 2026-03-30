'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { quotationsApi, useMutationWithToast } from '@/lib/api';
import {
  Card, CardHeader, CardTitle, Badge, Button,
  Modal, Textarea, EmptyState, StatCard,
} from '@/components/ui';
import { formatDate, formatDateTime, formatCurrency } from '@/lib/utils';
import {
  ArrowLeft, Send, CheckCircle2, XCircle, Printer, Download,
  FileText, Clock, DollarSign, Calendar, Package,
  Building2, Percent, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function QuotationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  // ── Query ─────────────────────────────────────────────────────────────
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['quotation', id],
    queryFn: () => quotationsApi.get(id),
    enabled: !!id,
  });

  const q = (data as any)?.data;

  // ── Mutations ─────────────────────────────────────────────────────────
  const sendMutation = useMutationWithToast(
    () => quotationsApi.send(id),
    {
      successMessage: 'Teklif gonderildi',
      invalidateKeys: [['quotation', id], ['quotations']],
    },
  );
  const acceptMutation = useMutationWithToast(
    () => quotationsApi.accept(id),
    {
      successMessage: 'Teklif kabul edildi',
      invalidateKeys: [['quotation', id], ['quotations']],
    },
  );
  const rejectMutation = useMutationWithToast(
    () => quotationsApi.reject(id, rejectReason),
    {
      successMessage: 'Teklif reddedildi',
      invalidateKeys: [['quotation', id], ['quotations']],
      onSuccess: () => {
        setShowReject(false);
        setRejectReason('');
      },
    },
  );

  const printPreview = () => window.print();

  const handleDownloadPdf = async () => {
    try {
      const blob = await quotationsApi.getPdf(id);
      const url = window.URL.createObjectURL(blob as any);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Teklif_${q?.quoteNumber || id}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('PDF indirildi');
    } catch (err: any) {
      toast.error('PDF oluşturulamadı');
    }
  };

  // ── Loading / not found ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <>
        <div className="space-y-4">
          <div className="h-10 skeleton rounded-xl w-48" />
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

  if (!q) {
    return (
      <>
        <EmptyState
          icon={<FileText className="w-10 h-10" />}
          title="Teklif bulunamadi"
          action={<Button onClick={() => router.push('/quotations')}>Geri Don</Button>}
        />
      </>
    );
  }

  const statusColors: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600',
    sent: 'bg-blue-100 text-blue-700',
    accepted: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    expired: 'bg-amber-100 text-amber-700',
  };
  const statusLabels: Record<string, string> = {
    draft: 'Taslak',
    sent: 'Gonderildi',
    accepted: 'Kabul Edildi',
    rejected: 'Reddedildi',
    expired: 'Suresi Doldu',
  };

  const currencySymbol = q.currency === 'TRY' ? 'TL' : q.currency === 'USD' ? '$' : q.currency === 'EUR' ? 'EUR' : q.currency;
  const isExpired =
    q.validUntil && new Date(q.validUntil) < new Date() && q.status !== 'accepted';

  // Status timeline
  const timelineSteps = [
    { key: 'draft', label: 'Olusturuldu', date: q.createdAt, icon: FileText },
    { key: 'sent', label: 'Gonderildi', date: q.sentAt, icon: Send },
    {
      key: q.status === 'rejected' ? 'rejected' : 'accepted',
      label: q.status === 'rejected' ? 'Reddedildi' : 'Kabul Edildi',
      date: q.acceptedAt || q.rejectedAt,
      icon: q.status === 'rejected' ? XCircle : CheckCircle2,
    },
  ];

  return (
    <>
      <button
        onClick={() => router.push('/quotations')}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition-colors print:hidden"
      >
        <ArrowLeft className="w-4 h-4" /> Teklifler
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 print:hidden">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-display font-extrabold text-2xl font-mono text-slate-900 dark:text-slate-100">
              {q.quoteNumber}
            </h1>
            <Badge color={statusColors[q.status] || ''} dot>
              {statusLabels[q.status] || q.status}
            </Badge>
            {isExpired && q.status === 'sent' && (
              <Badge color="bg-red-100 text-red-700">
                <AlertTriangle className="w-3 h-3 mr-1 inline" />
                Suresi Dolmus
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-400">
            Olusturulma: {formatDate(q.createdAt)} - Gecerlilik:{' '}
            <span className={isExpired ? 'text-red-600 font-semibold' : ''}>
              {formatDate(q.validUntil)}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<Download className="w-4 h-4" />}
            onClick={handleDownloadPdf}
          >
            PDF İndir
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<Printer className="w-4 h-4" />}
            onClick={printPreview}
          >
            Yazdir
          </Button>
          {q.status === 'draft' && (
            <Button
              size="sm"
              icon={<Send className="w-4 h-4" />}
              loading={sendMutation.isPending}
              onClick={() => sendMutation.mutate(undefined as any)}
            >
              Gonder
            </Button>
          )}
          {q.status === 'sent' && (
            <>
              <Button
                size="sm"
                icon={<CheckCircle2 className="w-4 h-4" />}
                loading={acceptMutation.isPending}
                onClick={() => acceptMutation.mutate(undefined as any)}
              >
                Kabul Et
              </Button>
              <Button
                size="sm"
                variant="outline"
                icon={<XCircle className="w-4 h-4" />}
                onClick={() => setShowReject(true)}
              >
                Reddet
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 print:hidden">
        <StatCard
          label="Musteri"
          value={q.customer?.name || q.customerId?.slice(0, 8) + '...'}
          icon={<Building2 className="w-5 h-5 text-teal-600" />}
          color="bg-teal-50 dark:bg-teal-950/40"
        />
        <StatCard
          label="Toplam Tutar"
          value={`${Number(q.totalAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${currencySymbol}`}
          icon={<DollarSign className="w-5 h-5 text-emerald-600" />}
          color="bg-emerald-50 dark:bg-emerald-950/40"
        />
        <StatCard
          label="Indirim"
          value={`%${q.discountRate || 0}`}
          icon={<Percent className="w-5 h-5 text-violet-600" />}
          color="bg-violet-50 dark:bg-violet-950/40"
        />
        <StatCard
          label="Gecerlilik"
          value={formatDate(q.validUntil)}
          icon={<Calendar className="w-5 h-5 text-amber-600" />}
          color="bg-amber-50 dark:bg-amber-950/40"
        />
      </div>

      {/* Status timeline */}
      <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 print:hidden">
        <div className="flex items-center justify-between">
          {timelineSteps.map((step, idx) => {
            const hasDate = !!step.date;
            const isCurrent =
              (step.key === q.status) ||
              (step.key === 'draft' && q.status === 'draft');
            const Icon = step.icon;
            return (
              <div key={step.key} className="flex items-center flex-1 last:flex-initial">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      hasDate
                        ? step.key === 'rejected'
                          ? 'bg-red-100 dark:bg-red-900/40'
                          : 'bg-green-100 dark:bg-green-900/40'
                        : isCurrent
                        ? 'bg-teal-600'
                        : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 ${
                        hasDate
                          ? step.key === 'rejected'
                            ? 'text-red-600'
                            : 'text-green-600'
                          : isCurrent
                          ? 'text-white'
                          : 'text-slate-400'
                      }`}
                    />
                  </div>
                  <p
                    className={`text-xs mt-1 ${
                      hasDate ? 'text-slate-700 dark:text-slate-300 font-semibold' : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </p>
                  {step.date && (
                    <p className="text-xs text-slate-400">
                      {formatDate(step.date)}
                    </p>
                  )}
                </div>
                {idx < timelineSteps.length - 1 && (
                  <div
                    className={`flex-1 h-px mx-3 ${
                      hasDate
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

      {/* Main content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:block">
        {/* Quotation document */}
        <div className="md:col-span-2 print:w-full">
          <Card>
            <div className="print:p-0">
              {/* Header */}
              <div className="flex justify-between items-start mb-8 pb-6 border-b border-slate-100 dark:border-slate-800 print:border-slate-300">
                <div>
                  <h2 className="font-bold text-2xl text-slate-900 dark:text-slate-100 print:text-black">
                    TEKLIF
                  </h2>
                  <p className="text-sm text-slate-500 print:text-gray-600">
                    No: <strong className="font-mono">{q.quoteNumber}</strong>
                  </p>
                </div>
                <div className="text-right text-sm text-slate-500 print:text-gray-600">
                  <p>Tarih: {formatDate(q.createdAt)}</p>
                  <p>Gecerlilik: {formatDate(q.validUntil)}</p>
                </div>
              </div>

              {/* Customer info */}
              {q.customer && (
                <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl print:bg-gray-50 print:rounded-none print:border print:border-gray-200">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Musteri
                  </p>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 print:text-black">
                    {q.customer.name}
                  </p>
                  {q.customer.contactName && (
                    <p className="text-sm text-slate-500">{q.customer.contactName}</p>
                  )}
                  {q.customer.city && (
                    <p className="text-sm text-slate-400">{q.customer.city}</p>
                  )}
                </div>
              )}

              {/* Items */}
              <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4">
                Teklif Kalemleri
              </h3>
              {q.items?.length > 0 ? (
                <table className="w-full text-sm mb-6">
                  <thead>
                    <tr className="border-b-2 border-slate-200 dark:border-slate-700">
                      <th className="text-left py-2 text-slate-500">#</th>
                      <th className="text-left py-2 text-slate-500">Aciklama</th>
                      <th className="text-left py-2 text-slate-500">Ekipman Tipi</th>
                      <th className="text-right py-2 text-slate-500">Miktar</th>
                      <th className="text-right py-2 text-slate-500">Birim Fiyat</th>
                      <th className="text-right py-2 text-slate-500">Indirim %</th>
                      <th className="text-right py-2 text-slate-500">Toplam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.items.map((item: any, i: number) => (
                      <tr
                        key={i}
                        className="border-b border-slate-100 dark:border-slate-800"
                      >
                        <td className="py-2.5 text-slate-400">{i + 1}</td>
                        <td className="py-2.5 text-slate-700 dark:text-slate-300">
                          {item.description}
                        </td>
                        <td className="py-2.5 text-slate-500">
                          {item.equipmentTypeName || item.equipmentType || '—'}
                        </td>
                        <td className="py-2.5 text-right">{item.quantity}</td>
                        <td className="py-2.5 text-right">
                          {Number(item.unitPrice).toLocaleString('tr-TR', {
                            minimumFractionDigits: 2,
                          })}{' '}
                          {currencySymbol}
                        </td>
                        <td className="py-2.5 text-right">
                          %{item.discountRate || 0}
                        </td>
                        <td className="py-2.5 text-right font-semibold">
                          {Number(item.totalPrice).toLocaleString('tr-TR', {
                            minimumFractionDigits: 2,
                          })}{' '}
                          {currencySymbol}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {q.discountRate > 0 && (
                      <tr>
                        <td colSpan={6} className="pt-3 text-right text-sm text-slate-500">
                          Ara Toplam:
                        </td>
                        <td className="pt-3 text-right text-sm text-slate-600 dark:text-slate-400">
                          {Number(
                            q.items.reduce(
                              (sum: number, item: any) => sum + Number(item.totalPrice),
                              0,
                            ),
                          ).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}{' '}
                          {currencySymbol}
                        </td>
                      </tr>
                    )}
                    {q.discountRate > 0 && (
                      <tr>
                        <td colSpan={6} className="pt-1 text-right text-sm text-slate-500">
                          Indirim (%{q.discountRate}):
                        </td>
                        <td className="pt-1 text-right text-sm text-red-600">
                          -{Number(
                            q.items.reduce(
                              (sum: number, item: any) => sum + Number(item.totalPrice),
                              0,
                            ) * (q.discountRate / 100),
                          ).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}{' '}
                          {currencySymbol}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td
                        colSpan={6}
                        className="pt-3 text-right font-bold text-slate-800 dark:text-slate-200"
                      >
                        Genel Toplam:
                      </td>
                      <td className="pt-3 text-right font-bold text-lg text-teal-600">
                        {Number(q.totalAmount).toLocaleString('tr-TR', {
                          minimumFractionDigits: 2,
                        })}{' '}
                        {currencySymbol}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <p className="text-sm text-slate-400 mb-6">Kalem eklenmemis</p>
              )}

              {q.notes && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm text-slate-600 dark:text-slate-400">
                  <strong>Notlar:</strong> {q.notes}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Side panel */}
        <div className="space-y-4 print:hidden">
          <Card>
            <CardHeader><CardTitle>Ozet</CardTitle></CardHeader>
            <div className="space-y-3 text-sm">
              {[
                {
                  label: 'Musteri',
                  value: q.customer?.name || q.customerId?.slice(0, 8) + '...',
                  link: q.customerId ? `/customers/${q.customerId}` : undefined,
                },
                { label: 'Para Birimi', value: q.currency },
                { label: 'Indirim', value: `%${q.discountRate || 0}` },
                { label: 'Kalem Sayisi', value: q.items?.length || 0 },
              ].map((row) => (
                <div key={row.label} className="flex justify-between">
                  <span className="text-slate-400">{row.label}</span>
                  {(row as any).link ? (
                    <button
                      className="text-teal-600 hover:underline text-sm"
                      onClick={() => router.push((row as any).link)}
                    >
                      {row.value}
                    </button>
                  ) : (
                    <span className="text-slate-700 dark:text-slate-300">
                      {row.value}
                    </span>
                  )}
                </div>
              ))}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-semibold">Toplam</span>
                  <span className="font-bold text-teal-600">
                    {Number(q.totalAmount).toLocaleString('tr-TR', {
                      minimumFractionDigits: 2,
                    })}{' '}
                    {currencySymbol}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Status info cards */}
          {q.acceptedAt && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-xl text-sm text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <div>
                <p className="font-semibold">Kabul Edildi</p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  {formatDateTime(q.acceptedAt)}
                </p>
              </div>
            </div>
          )}

          {q.rejectedAt && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-xl text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="w-4 h-4 flex-shrink-0" />
                <p className="font-semibold">Reddedildi</p>
              </div>
              <p className="text-xs text-red-600 dark:text-red-400">
                {formatDateTime(q.rejectedAt)}
              </p>
              {q.rejectionReason && (
                <div className="mt-2 p-2 bg-red-100/50 dark:bg-red-900/20 rounded-lg">
                  <p className="text-xs font-semibold mb-0.5">Gerekcesi:</p>
                  <p className="text-xs">{q.rejectionReason}</p>
                </div>
              )}
            </div>
          )}

          {q.sentAt && !q.acceptedAt && !q.rejectedAt && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl text-sm text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              <Send className="w-4 h-4 flex-shrink-0" />
              <div>
                <p className="font-semibold">Gonderildi</p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {formatDateTime(q.sentAt)}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      <Modal
        open={showReject}
        onClose={() => {
          setShowReject(false);
          setRejectReason('');
        }}
        title="Teklifi Reddet"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setShowReject(false);
                setRejectReason('');
              }}
            >
              Iptal
            </Button>
            <Button
              variant="danger"
              loading={rejectMutation.isPending}
              disabled={!rejectReason.trim()}
              onClick={() => rejectMutation.mutate(undefined as any)}
            >
              Reddet
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">
              Bu teklifi reddetmek istediginize emin misiniz?
            </p>
          </div>
          <Textarea
            label="Red Gerekcesi *"
            value={rejectReason}
            onChange={(e: any) => setRejectReason(e.target.value)}
            placeholder="Red nedenini aciklayiniz..."
            rows={4}
            required
          />
        </div>
      </Modal>
    </>
  );
}
