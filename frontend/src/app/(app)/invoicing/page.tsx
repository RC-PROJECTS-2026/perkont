'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { workOrdersApi, logoApi, invoicePrepApi, paymentsApi, useMutationWithToast } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, StatCard,
  SkeletonTable, EmptyState, Modal, Input, Select,
} from '@/components/ui';
import { formatDate, formatCurrency } from '@/lib/utils';
import { CreditCard, RefreshCw, Zap, AlertTriangle, CheckCircle2, XCircle, RotateCcw, DollarSign, Banknote } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api-client';

export default function InvoicingPage() {
  const [selected, setSelected]       = useState<any[]>([]);
  const [invoiceModal, setInvoiceModal] = useState<any>(null);
  const [invoiceDate, setInvoiceDate]   = useState(new Date().toISOString().split('T')[0]);
  const [paymentModal, setPaymentModal] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [cancelModal, setCancelModal]   = useState<any>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [refundModal, setRefundModal]   = useState<any>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [ccModal, setCcModal]           = useState<any>(null);
  const [checkoutHtml, setCheckoutHtml] = useState<string | null>(null);
  const [ccForm, setCcForm]             = useState({
    buyerName: '', buyerSurname: '', buyerEmail: '', buyerPhone: '',
    buyerTcNo: '', buyerAddress: '', buyerCity: '', installment: 1,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ready-for-invoice'],
    queryFn: workOrdersApi.getReadyForInvoice,
  });
  const { data: statsData } = useQuery({
    queryKey: ['logo-stats-invoice'],
    queryFn: logoApi.getStats,
    refetchInterval: 15000,
  });

  const { data: paymentSummaryData } = useQuery({
    queryKey: ['payment-summary'],
    queryFn: invoicePrepApi.getPaymentSummary,
  });
  const { data: batchData, isLoading: batchLoading, refetch: refetchBatch } = useQuery({
    queryKey: ['invoice-batches'],
    queryFn: () => invoicePrepApi.getBatch(),
  });

  const paymentSummary = (paymentSummaryData as any)?.data || {};
  const batches = (batchData as any)?.data || [];

  const workOrders = (data as any)?.data || [];
  const logoStats  = (statsData as any)?.data || {};

  const createInvoiceMutation = useMutationWithToast(
    (payload: any) => apiClient.post('/logo/invoices', payload),
    {
      successMessage: 'Fatura kuyruğa eklendi',
      invalidateKeys: [['ready-for-invoice'], ['logo-queue']],
      onSuccess: () => { setInvoiceModal(null); setSelected([]); },
    },
  );

  const handleCreateInvoice = (workOrder: any) => {
    const items = workOrder.equipmentItems?.map((item: any) => ({
      serviceCode:  item.serviceCode || 'KONTROL',
      description:  `Periyodik Kontrol — ${workOrder.workOrderNumber}`,
      quantity:     1,
      unitPrice:    item.unitPrice || 0,
      vatRate:      20,
    })) || [];

    createInvoiceMutation.mutate({
      workOrderId: workOrder.id,
      customerId:  workOrder.customerId,
      items,
      invoiceDate,
    });
  };

  const recordPaymentMutation = useMutationWithToast(
    ({ id, amount }: { id: string; amount: number }) => invoicePrepApi.recordPayment(id, amount),
    {
      successMessage: 'Ödeme kaydedildi',
      invalidateKeys: [['invoice-batches'], ['payment-summary']],
      onSuccess: () => { setPaymentModal(null); setPaymentAmount(''); },
    },
  );
  const cancelBatchMutation = useMutationWithToast(
    ({ id, reason }: { id: string; reason: string }) => invoicePrepApi.cancelBatch(id, reason),
    {
      successMessage: 'Fatura iptal edildi',
      invalidateKeys: [['invoice-batches'], ['payment-summary']],
      onSuccess: () => { setCancelModal(null); setCancelReason(''); },
    },
  );
  const refundBatchMutation = useMutationWithToast(
    ({ id, refundAmount }: { id: string; refundAmount: number }) => invoicePrepApi.refundBatch(id, refundAmount),
    {
      successMessage: 'İade işlemi tamamlandı',
      invalidateKeys: [['invoice-batches'], ['payment-summary']],
      onSuccess: () => { setRefundModal(null); setRefundAmount(''); },
    },
  );

  const qc = useQueryClient();
  const ccMutation = useMutation({
    mutationFn: (data: any) => paymentsApi.initiateCheckout(data),
    onSuccess: (res: any) => {
      const html = res.data?.checkoutFormUrl || res.data?.data?.checkoutFormUrl;
      if (html) {
        setCheckoutHtml(html);
        setCcModal(null);
      } else {
        toast.error('Checkout form alınamadı');
      }
    },
    onError: (e: any) => toast.error(e.response?.data?.message || e.message || 'Ödeme başlatılamadı'),
  });

  const handleCreditCardPayment = () => {
    if (!ccModal) return;
    if (!ccForm.buyerName || !ccForm.buyerSurname || !ccForm.buyerEmail) {
      toast.error('Ad, Soyad ve E-posta zorunludur');
      return;
    }
    ccMutation.mutate({
      invoiceBatchId: ccModal.id,
      customerId: ccModal.customerId,
      amount: Number(ccModal.totalWithVat || ccModal.totalAmount),
      installment: ccForm.installment,
      buyerName: ccForm.buyerName,
      buyerSurname: ccForm.buyerSurname,
      buyerEmail: ccForm.buyerEmail,
      buyerPhone: ccForm.buyerPhone || '+905000000000',
      buyerTcNo: ccForm.buyerTcNo || '11111111111',
      buyerAddress: ccForm.buyerAddress || 'Türkiye',
      buyerCity: ccForm.buyerCity || 'Istanbul',
      description: `Fatura: ${ccModal.batchNumber || ccModal.id?.slice(0, 8)}`,
    });
  };

  const totalValue = workOrders.reduce((sum: number, wo: any) =>
    sum + (wo.equipmentItems || []).reduce((s: number, i: any) => s + (i.unitPrice || 0), 0), 0,
  );

  return (
    <>
      <PageHeader
        title="Faturalama"
        subtitle="Tamamlanmış ve rapor onaylı iş emirleri"
        actions={
          <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Faturalanmayı Bekleyen" value={workOrders.length}
          icon={<CreditCard className="w-5 h-5 text-teal-600" />} color="bg-teal-50 dark:bg-teal-950/40" />
        <StatCard label="Tahmini Toplam" value={`₺${totalValue.toLocaleString('tr-TR')}`}
          icon={<CreditCard className="w-5 h-5 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-950/40" />
        <StatCard label="LOGO Kuyruğu" value={(logoStats.pending || 0) + (logoStats.processing || 0)}
          icon={<Zap className="w-5 h-5 text-amber-600" />} color="bg-amber-50 dark:bg-amber-950/40" />
        <StatCard label="LOGO Hataları" value={logoStats.failed || 0}
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />} color="bg-red-50 dark:bg-red-950/40" />
      </div>

      {logoStats.failed > 0 && (
        <div className="mb-4 flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{logoStats.failed} LOGO fatura hatalı. </span>
          <a href="/logo" className="ml-1 underline font-semibold">LOGO paneline git →</a>
        </div>
      )}

      <Card padding="none">
        {isLoading ? <SkeletonTable rows={6} cols={6} /> : workOrders.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="w-12 h-12" />}
            title="Faturalanmayı bekleyen iş emri yok"
            description="Tüm tamamlanmış işler faturalandı"
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>İş Emri No</th>
                <th>Müşteri</th>
                <th>LOGO Cari</th>
                <th>Ekipman Sayısı</th>
                <th>Tahmini Tutar</th>
                <th>Tamamlanma</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((wo: any) => {
                const total = (wo.equipmentItems || []).reduce(
                  (s: number, i: any) => s + (i.unitPrice || 0), 0,
                );
                const hasLogoCari = !!wo.customer?.logoCariId;
                return (
                  <tr key={wo.id}>
                    <td><span className="font-mono text-xs font-semibold">{wo.workOrderNumber}</span></td>
                    <td>
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{wo.customer?.name}</p>
                      </div>
                    </td>
                    <td>
                      {hasLogoCari ? (
                        <Badge color="bg-green-100 text-green-700" dot>Bağlı</Badge>
                      ) : (
                        <Badge color="bg-red-100 text-red-700" dot>Eşlenmedi</Badge>
                      )}
                    </td>
                    <td><span className="text-sm font-semibold">{wo.equipmentItems?.length || 0}</span></td>
                    <td>
                      <span className={`text-sm font-semibold ${total > 0 ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'}`}>
                        {total > 0 ? `₺${total.toLocaleString('tr-TR')}` : 'Fiyat girilmemiş'}
                      </span>
                    </td>
                    <td><span className="text-sm text-slate-500">{formatDate(wo.completedAt)}</span></td>
                    <td>
                      {hasLogoCari ? (
                        <Button
                          size="sm"
                          icon={<Zap className="w-3.5 h-3.5" />}
                          onClick={() => setInvoiceModal(wo)}
                          loading={createInvoiceMutation.isPending}
                        >
                          Fatura Oluştur
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            toast.error('Müşteri LOGO cari kartıyla eşlenmemiş. Önce eşleme yapın.');
                          }}
                        >
                          Cari Eşle
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

      {/* Ödeme Özeti */}
      {paymentSummary && (
        <div className="mt-6 mb-6">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4">Ödeme Özeti</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Toplam Fatura" value={`₺${Number(paymentSummary.totalInvoiced || 0).toLocaleString('tr-TR')}`}
              icon={<CreditCard className="w-5 h-5 text-teal-600" />} color="bg-teal-50 dark:bg-teal-950/40" />
            <StatCard label="Toplam Tahsilat" value={`₺${Number(paymentSummary.totalPaid || 0).toLocaleString('tr-TR')}`}
              icon={<DollarSign className="w-5 h-5 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-950/40" />
            <StatCard label="Bekleyen Ödeme" value={`₺${Number(paymentSummary.totalPending || 0).toLocaleString('tr-TR')}`}
              icon={<AlertTriangle className="w-5 h-5 text-amber-600" />} color="bg-amber-50 dark:bg-amber-950/40" />
            <StatCard label="İade Toplamı" value={`₺${Number(paymentSummary.totalRefunded || 0).toLocaleString('tr-TR')}`}
              icon={<RotateCcw className="w-5 h-5 text-red-600" />} color="bg-red-50 dark:bg-red-950/40" />
          </div>
        </div>
      )}

      {/* Fatura Partileri */}
      {batches.length > 0 && (
        <Card padding="none" className="mb-6">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200">Fatura Partileri</h3>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Parti No</th>
                <th>Müşteri</th>
                <th>Tutar</th>
                <th>Durum</th>
                <th>Ödeme</th>
                <th>Tarih</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch: any) => (
                <tr key={batch.id}>
                  <td><span className="font-mono text-xs font-semibold">{batch.batchNumber || batch.id?.slice(0, 8)}</span></td>
                  <td><span className="text-sm text-slate-700 dark:text-slate-300">{batch.customer?.name || '—'}</span></td>
                  <td><span className="text-sm font-semibold">₺{Number(batch.totalAmount || 0).toLocaleString('tr-TR')}</span></td>
                  <td><Badge color={batch.status === 'cancelled' ? 'bg-slate-800 text-slate-500' : batch.status === 'sent_to_logo' ? 'bg-blue-900/30 text-blue-400' : 'bg-amber-900/30 text-amber-400'} dot>{batch.status === 'prepared' ? 'Hazırlandı' : batch.status === 'sent_to_logo' ? 'LOGO\'ya Gönderildi' : batch.status === 'cancelled' ? 'İptal' : batch.status || '—'}</Badge></td>
                  <td><Badge color={batch.paymentStatus === 'paid' ? 'bg-green-900/30 text-green-400' : batch.paymentStatus === 'partial' ? 'bg-amber-900/30 text-amber-400' : 'bg-red-900/30 text-red-400'} dot>{batch.paymentStatus === 'paid' ? 'Ödendi' : batch.paymentStatus === 'partial' ? 'Kısmi' : 'Ödenmedi'}</Badge></td>
                  <td><span className="text-sm text-slate-500">{formatDate(batch.createdAt)}</span></td>
                  <td>
                    <div className="flex gap-1 flex-wrap">
                      {batch.paymentStatus !== 'paid' && batch.status !== 'cancelled' && (
                        <Button size="sm" icon={<CreditCard className="w-3.5 h-3.5" />}
                          onClick={() => {
                            setCcModal(batch);
                            setCcForm({ buyerName: '', buyerSurname: '', buyerEmail: '', buyerPhone: '', buyerTcNo: '', buyerAddress: '', buyerCity: '', installment: 1 });
                          }}>
                          Kredi Kartı
                        </Button>
                      )}
                      <Button size="sm" variant="outline" icon={<Banknote className="w-3.5 h-3.5" />}
                        onClick={() => { setPaymentModal(batch); setPaymentAmount(''); }}>
                        Havale/Nakit
                      </Button>
                      {batch.status !== 'cancelled' && (
                        <Button size="sm" variant="outline" icon={<XCircle className="w-3.5 h-3.5" />}
                          onClick={() => { setCancelModal(batch); setCancelReason(''); }}>
                          İptal
                        </Button>
                      )}
                      {batch.paymentStatus === 'paid' && (
                        <Button size="sm" variant="outline" icon={<RotateCcw className="w-3.5 h-3.5" />}
                          onClick={() => { setRefundModal(batch); setRefundAmount(''); }}>
                          İade
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Invoice Confirm Modal */}
      <Modal
        open={!!invoiceModal}
        onClose={() => setInvoiceModal(null)}
        title={`Fatura Oluştur — ${invoiceModal?.workOrderNumber}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setInvoiceModal(null)}>İptal</Button>
            <Button
              icon={<Zap className="w-4 h-4" />}
              loading={createInvoiceMutation.isPending}
              onClick={() => handleCreateInvoice(invoiceModal)}
            >
              LOGO'ya Gönder
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm text-slate-600 dark:text-slate-400">
            <p><strong>Müşteri:</strong> {invoiceModal?.customer?.name}</p>
            <p><strong>Ekipman:</strong> {invoiceModal?.equipmentItems?.length} adet</p>
          </div>
          <Input
            label="Fatura Tarihi"
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
          <p className="text-xs text-slate-400">
            Fatura LOGO ERP kuyruğuna eklenecek ve otomatik işlenecektir.
          </p>
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal
        open={!!paymentModal}
        onClose={() => setPaymentModal(null)}
        title={`Ödeme Kaydet — ${paymentModal?.batchNumber || paymentModal?.id?.slice(0, 8)}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPaymentModal(null)}>İptal</Button>
            <Button
              icon={<DollarSign className="w-4 h-4" />}
              loading={recordPaymentMutation.isPending}
              disabled={!paymentAmount || Number(paymentAmount) <= 0}
              onClick={() => recordPaymentMutation.mutate({ id: paymentModal.id, amount: Number(paymentAmount) })}
            >
              Ödeme Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm text-slate-600 dark:text-slate-400">
            <p><strong>Parti:</strong> {paymentModal?.batchNumber || paymentModal?.id?.slice(0, 8)}</p>
            <p><strong>Toplam Tutar:</strong> ₺{Number(paymentModal?.totalAmount || 0).toLocaleString('tr-TR')}</p>
          </div>
          <Input
            label="Ödeme Tutarı (₺)"
            type="number"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
      </Modal>

      {/* Cancel Modal */}
      <Modal
        open={!!cancelModal}
        onClose={() => setCancelModal(null)}
        title={`Fatura İptal — ${cancelModal?.batchNumber || cancelModal?.id?.slice(0, 8)}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelModal(null)}>Vazgeç</Button>
            <Button
              variant="danger"
              icon={<XCircle className="w-4 h-4" />}
              loading={cancelBatchMutation.isPending}
              disabled={!cancelReason.trim()}
              onClick={() => cancelBatchMutation.mutate({ id: cancelModal.id, reason: cancelReason })}
            >
              İptal Et
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">Bu faturayı iptal etmek istediğinize emin misiniz?</p>
          </div>
          <Input
            label="İptal Nedeni *"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="İptal nedenini giriniz..."
          />
        </div>
      </Modal>

      {/* Refund Modal */}
      <Modal
        open={!!refundModal}
        onClose={() => setRefundModal(null)}
        title={`İade — ${refundModal?.batchNumber || refundModal?.id?.slice(0, 8)}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRefundModal(null)}>İptal</Button>
            <Button
              icon={<RotateCcw className="w-4 h-4" />}
              loading={refundBatchMutation.isPending}
              disabled={!refundAmount || Number(refundAmount) <= 0}
              onClick={() => refundBatchMutation.mutate({ id: refundModal.id, refundAmount: Number(refundAmount) })}
            >
              İade Yap
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm text-slate-600 dark:text-slate-400">
            <p><strong>Parti:</strong> {refundModal?.batchNumber || refundModal?.id?.slice(0, 8)}</p>
            <p><strong>Toplam Tutar:</strong> ₺{Number(refundModal?.totalAmount || 0).toLocaleString('tr-TR')}</p>
          </div>
          <Input
            label="İade Tutarı (₺)"
            type="number"
            value={refundAmount}
            onChange={(e) => setRefundAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
      </Modal>
      {/* Kredi Kartı Modal */}
      <Modal
        open={!!ccModal}
        onClose={() => setCcModal(null)}
        title={`Kredi Kartı ile Ödeme — ${ccModal?.batchNumber || ''}`}
        size="lg"
      >
        <div className="space-y-4">
          <div className="p-4 bg-teal-900/20 border border-teal-800/40 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Fatura Tutarı</p>
                <p className="text-2xl font-bold text-teal-400">
                  {formatCurrency(Number(ccModal?.totalWithVat || ccModal?.totalAmount || 0))}
                </p>
              </div>
              <CreditCard className="w-10 h-10 text-teal-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Ad *" value={ccForm.buyerName} onChange={e => setCcForm({...ccForm, buyerName: e.target.value})} placeholder="Alıcı adı" />
            <Input label="Soyad *" value={ccForm.buyerSurname} onChange={e => setCcForm({...ccForm, buyerSurname: e.target.value})} placeholder="Alıcı soyadı" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="E-posta *" type="email" value={ccForm.buyerEmail} onChange={e => setCcForm({...ccForm, buyerEmail: e.target.value})} placeholder="ornek@firma.com" />
            <Input label="Telefon" value={ccForm.buyerPhone} onChange={e => setCcForm({...ccForm, buyerPhone: e.target.value})} placeholder="+905551234567" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="TC Kimlik No" value={ccForm.buyerTcNo} onChange={e => setCcForm({...ccForm, buyerTcNo: e.target.value})} placeholder="11111111111" />
            <Input label="Şehir" value={ccForm.buyerCity} onChange={e => setCcForm({...ccForm, buyerCity: e.target.value})} placeholder="Istanbul" />
            <Select
              label="Taksit"
              value={String(ccForm.installment)}
              onChange={e => setCcForm({...ccForm, installment: Number(e.target.value)})}
              options={[
                { value: '1', label: 'Tek Çekim' },
                { value: '2', label: '2 Taksit' },
                { value: '3', label: '3 Taksit' },
                { value: '6', label: '6 Taksit' },
                { value: '9', label: '9 Taksit' },
                { value: '12', label: '12 Taksit' },
              ]}
            />
          </div>
          <Input label="Adres" value={ccForm.buyerAddress} onChange={e => setCcForm({...ccForm, buyerAddress: e.target.value})} placeholder="Fatura adresi" />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setCcModal(null)}>İptal</Button>
            <Button
              icon={<CreditCard className="w-4 h-4" />}
              loading={ccMutation.isPending}
              onClick={handleCreditCardPayment}
            >
              Ödeme Sayfasına Git
            </Button>
          </div>
        </div>
      </Modal>

      {/* iyzico Checkout Form Modal */}
      <Modal
        open={!!checkoutHtml}
        onClose={() => setCheckoutHtml(null)}
        title="Kredi Kartı Bilgileri"
        size="lg"
      >
        <div className="min-h-[400px]">
          {checkoutHtml && (
            <div
              dangerouslySetInnerHTML={{ __html: checkoutHtml }}
              className="iyzico-checkout-form"
            />
          )}
        </div>
      </Modal>
    </>
  );
}
