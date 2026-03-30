'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { paymentsApi } from '@/lib/api';
import {
  PageHeader, Card, CardHeader, CardTitle, Badge, Button,
  Tabs, Modal, Input, Select, SkeletonTable, EmptyState, StatCard,
} from '@/components/ui';
import { formatDate, formatCurrency } from '@/lib/utils';
import {
  CreditCard, DollarSign, RefreshCw, Plus, CheckCircle2,
  AlertTriangle, Clock, Banknote, RotateCcw, TrendingUp,
} from 'lucide-react';
import toast from 'react-hot-toast';

const statusLabels: Record<string, string> = {
  pending: 'Bekliyor', success: 'Başarılı', failed: 'Başarısız',
  refunded: 'İade Edildi', cancelled: 'İptal',
};
const statusColors: Record<string, string> = {
  pending: 'bg-amber-900/30 text-amber-400',
  success: 'bg-green-900/30 text-green-400',
  failed: 'bg-red-900/30 text-red-400',
  refunded: 'bg-purple-900/30 text-purple-400',
  cancelled: 'bg-slate-800 text-slate-400',
};
const methodLabels: Record<string, string> = {
  credit_card: 'Kredi Kartı', bank_transfer: 'Havale/EFT', cash: 'Nakit',
};

export default function PaymentsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('all');
  const [showManual, setShowManual] = useState(false);
  const [showRefund, setShowRefund] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState(0);
  const [manualForm, setManualForm] = useState({
    invoiceBatchId: '', customerId: '', amount: 0, method: 'bank_transfer', notes: '',
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['payments', tab],
    queryFn: () => paymentsApi.list({ status: tab === 'all' ? undefined : tab, limit: 100 }),
  });
  const payments = (data as any)?.data?.data || [];

  const { data: statsData } = useQuery({
    queryKey: ['payments-stats'],
    queryFn: () => paymentsApi.getStats(),
    refetchInterval: 30000,
  });
  const stats = (statsData as any)?.data || {};

  const manualMut = useMutation({
    mutationFn: (data: any) => paymentsApi.recordManual(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['payments-stats'] });
      setShowManual(false);
      toast.success('Ödeme kaydedildi');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || e.message),
  });

  const refundMut = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) => paymentsApi.refund(id, amount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['payments-stats'] });
      setShowRefund(null);
      toast.success('İade başarılı');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || e.message),
  });

  const tabs = [
    { key: 'all', label: 'Tümü' },
    { key: 'success', label: 'Başarılı', count: stats.successCount || 0 },
    { key: 'pending', label: 'Bekliyor', count: stats.pendingCount || 0 },
    { key: 'failed', label: 'Başarısız', count: stats.failedCount || 0 },
  ];

  return (
    <>
      <PageHeader
        title="Ödemeler"
        subtitle="Kredi kartı, havale ve nakit ödemelerin takibi"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowManual(true)}>Manuel Ödeme</Button>
          </div>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Toplam Tahsilat"
          value={formatCurrency(stats.totalReceived || 0)}
          icon={<DollarSign className="w-5 h-5 text-green-400" />}
          color="bg-green-950/40"
        />
        <StatCard
          label="Bugün"
          value={formatCurrency(stats.todayReceived || 0)}
          icon={<TrendingUp className="w-5 h-5 text-teal-400" />}
          color="bg-teal-950/40"
        />
        <StatCard
          label="Bu Ay"
          value={formatCurrency(stats.monthReceived || 0)}
          icon={<CreditCard className="w-5 h-5 text-blue-400" />}
          color="bg-blue-950/40"
        />
        <StatCard
          label="Başarısız"
          value={stats.failedCount || 0}
          icon={<AlertTriangle className="w-5 h-5 text-red-400" />}
          color="bg-red-950/40"
        />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      <Card padding="none">
        {isLoading ? (
          <SkeletonTable rows={8} cols={8} />
        ) : payments.length === 0 ? (
          <EmptyState
            icon={<CreditCard className="w-12 h-12" />}
            title="Ödeme bulunamadı"
            description="Henüz ödeme kaydı yok."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Fatura No</th>
                  <th>Yöntem</th>
                  <th>Tutar</th>
                  <th>Taksit</th>
                  <th>Kart</th>
                  <th>Durum</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p: any) => (
                  <tr key={p.id}>
                    <td><span className="text-xs text-slate-400">{formatDate(p.paidAt || p.createdAt)}</span></td>
                    <td><span className="font-mono text-xs text-teal-400">{p.invoiceBatchId?.slice(0, 8)}…</span></td>
                    <td>
                      <div className="flex items-center gap-2">
                        {p.method === 'credit_card' ? <CreditCard className="w-4 h-4 text-blue-400" /> :
                         p.method === 'bank_transfer' ? <Banknote className="w-4 h-4 text-green-400" /> :
                         <DollarSign className="w-4 h-4 text-amber-400" />}
                        <span className="text-xs text-slate-300">{methodLabels[p.method] || p.method}</span>
                      </div>
                    </td>
                    <td><span className="text-sm font-semibold text-slate-200">{formatCurrency(p.amount)}</span></td>
                    <td>
                      {p.method === 'credit_card' && p.installment > 1 ? (
                        <span className="text-xs text-slate-400">{p.installment} Taksit</span>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td>
                      {p.cardLastFour ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-400">****{p.cardLastFour}</span>
                          {p.cardBrand && <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-500">{p.cardBrand}</span>}
                        </div>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td>
                      <Badge color={statusColors[p.status] || 'bg-slate-800 text-slate-400'}>
                        {statusLabels[p.status] || p.status}
                      </Badge>
                    </td>
                    <td>
                      {p.status === 'success' && (
                        <button
                          onClick={() => { setShowRefund(p.id); setRefundAmount(Number(p.amount)); }}
                          className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-red-400 transition-colors"
                          title="İade"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      {p.status === 'failed' && p.errorMessage && (
                        <span className="text-xs text-red-400 truncate max-w-[120px] block" title={p.errorMessage}>
                          {p.errorMessage.slice(0, 20)}…
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Manuel Ödeme Modalı */}
      <Modal open={showManual} onClose={() => setShowManual(false)} title="Manuel Ödeme Kaydı" size="md">
        <div className="space-y-4">
          <Input
            label="Fatura Batch ID"
            value={manualForm.invoiceBatchId}
            onChange={e => setManualForm({...manualForm, invoiceBatchId: e.target.value})}
            placeholder="Fatura batch ID'si"
          />
          <Input
            label="Müşteri ID"
            value={manualForm.customerId}
            onChange={e => setManualForm({...manualForm, customerId: e.target.value})}
            placeholder="Müşteri ID'si"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Tutar (₺)"
              type="number"
              value={manualForm.amount}
              onChange={e => setManualForm({...manualForm, amount: +e.target.value})}
            />
            <Select
              label="Ödeme Yöntemi"
              value={manualForm.method}
              onChange={e => setManualForm({...manualForm, method: e.target.value})}
              options={[
                { value: 'bank_transfer', label: 'Havale / EFT' },
                { value: 'cash', label: 'Nakit' },
              ]}
            />
          </div>
          <Button
            className="w-full"
            loading={manualMut.isPending}
            onClick={() => {
              if (!manualForm.invoiceBatchId) { toast.error('Fatura batch ID giriniz'); return; }
              if (!manualForm.amount || manualForm.amount <= 0) { toast.error('Tutar giriniz'); return; }
              manualMut.mutate(manualForm);
            }}
          >
            Ödeme Kaydet
          </Button>
        </div>
      </Modal>

      {/* İade Modalı */}
      <Modal open={!!showRefund} onClose={() => setShowRefund(null)} title="Ödeme İadesi" size="sm">
        <div className="space-y-4">
          <Input
            label="İade Tutarı (₺)"
            type="number"
            value={refundAmount}
            onChange={e => setRefundAmount(+e.target.value)}
          />
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setShowRefund(null)}>İptal</Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700"
              loading={refundMut.isPending}
              onClick={() => {
                if (!refundAmount || refundAmount <= 0) { toast.error('Tutar giriniz'); return; }
                refundMut.mutate({ id: showRefund!, amount: refundAmount });
              }}
            >
              İade Et
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
