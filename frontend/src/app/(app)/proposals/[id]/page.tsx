'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { proposalsApi, useMutationWithToast } from '@/lib/api';
import {
  Card, CardHeader, CardTitle, Badge, Button,
  Modal, Textarea, Input, Select, EmptyState, StatCard, Tabs,
} from '@/components/ui';
import { formatDate, formatDateTime } from '@/lib/utils';
import {
  ArrowLeft, Send, CheckCircle2, XCircle, Download, Printer,
  FileText, Clock, DollarSign, Calendar, Building2, Percent,
  AlertTriangle, GitBranch, Plus, Trash2, FileCheck, CheckCircle,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

const statusColors: Record<string, string> = {
  draft:    'bg-slate-100 text-slate-600',
  sent:     'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  expired:  'bg-amber-100 text-amber-700',
};
const statusLabels: Record<string, string> = {
  draft: 'Taslak', sent: 'Gönderildi', accepted: 'Kabul Edildi',
  rejected: 'Reddedildi', expired: 'Süresi Dolmuş',
};

export default function ProposalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('general');
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showAcceptConfirm, setShowAcceptConfirm] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);

  // ── Queries ─────────────────────────────────────────────────────────
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['proposal', id],
    queryFn: () => proposalsApi.get(id),
    enabled: !!id,
  });
  const p = (data as any)?.data;

  const { data: statusLogData } = useQuery({
    queryKey: ['proposal-status-log', id],
    queryFn: () => proposalsApi.getStatusLog(id),
    enabled: !!id && activeTab === 'status-log',
  });
  const statusLog = (statusLogData as any)?.data || [];

  // ── Item form ───────────────────────────────────────────────────────
  const { register: regItem, handleSubmit: submitItem, reset: resetItem } = useForm<any>({
    defaultValues: { quantity: 1, unitPrice: 0, discountRate: 0 },
  });

  // ── Mutations ───────────────────────────────────────────────────────
  const sendMutation = useMutationWithToast(
    () => proposalsApi.send(id),
    { successMessage: 'Teklif gönderildi', invalidateKeys: [['proposal', id], ['proposals']] },
  );
  const acceptMutation = useMutationWithToast(
    () => proposalsApi.accept(id),
    { successMessage: 'Teklif kabul edildi', invalidateKeys: [['proposal', id], ['proposals']] },
  );
  const rejectMutation = useMutationWithToast(
    () => proposalsApi.reject(id, rejectReason),
    {
      successMessage: 'Teklif reddedildi',
      invalidateKeys: [['proposal', id], ['proposals']],
      onSuccess: () => { setShowReject(false); setRejectReason(''); },
    },
  );
  const revisionMutation = useMutationWithToast(
    () => proposalsApi.createRevision(id),
    {
      successMessage: 'Yeni revizyon oluşturuldu',
      invalidateKeys: [['proposal', id], ['proposals']],
      onSuccess: (res: any) => {
        const newId = res?.data?.id;
        if (newId) router.push(`/proposals/${newId}`);
      },
    },
  );
  const addItemMutation = useMutationWithToast(
    (itemData: any) => proposalsApi.addItem(id, itemData),
    {
      successMessage: 'Kalem eklendi',
      invalidateKeys: [['proposal', id]],
      onSuccess: () => { setShowAddItem(false); resetItem(); },
    },
  );
  const removeItemMutation = useMutationWithToast(
    (itemId: string) => proposalsApi.removeItem(id, itemId),
    { successMessage: 'Kalem silindi', invalidateKeys: [['proposal', id]] },
  );

  const handleDownloadPdf = async () => {
    try {
      const blob = await proposalsApi.getPdf(id);
      const url = window.URL.createObjectURL(blob as any);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Teklif_${p?.proposalNumber || id}.pdf`;
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

  if (!p) {
    return (
      <EmptyState
        icon={<FileText className="w-10 h-10" />}
        title="Teklif bulunamadı"
        action={<Button onClick={() => router.push('/proposals')}>Geri Dön</Button>}
      />
    );
  }

  const currencySymbol = p.currency === 'TRY' ? '₺' : p.currency === 'USD' ? '$' : p.currency === 'EUR' ? '€' : p.currency;
  const isExpired = p.validUntil && new Date(p.validUntil) < new Date() && p.status !== 'accepted';
  const items = p.items || [];
  const subtotal = items.reduce((s: number, it: any) => s + (Number(it.totalPrice) || Number(it.unitPrice) * Number(it.quantity) || 0), 0);
  const discountAmount = subtotal * ((p.discountRate || 0) / 100);
  const kdvRate = p.kdvRate || 20;
  const afterDiscount = subtotal - discountAmount;
  const kdvAmount = afterDiscount * (kdvRate / 100);
  const grandTotal = afterDiscount + kdvAmount;

  // Status timeline
  const timelineSteps = [
    { key: 'draft', label: 'Oluşturuldu', date: p.createdAt, icon: FileText },
    { key: 'sent', label: 'Gönderildi', date: p.sentAt, icon: Send },
    {
      key: p.status === 'rejected' ? 'rejected' : 'accepted',
      label: p.status === 'rejected' ? 'Reddedildi' : 'Kabul Edildi',
      date: p.acceptedAt || p.rejectedAt,
      icon: p.status === 'rejected' ? XCircle : CheckCircle2,
    },
  ];

  const detailTabs = [
    { key: 'general', label: 'Genel Bilgiler' },
    { key: 'items', label: 'Teklif Kalemleri' },
    { key: 'status-log', label: 'Durum Geçmişi' },
  ];

  return (
    <>
      {/* Back button */}
      <button
        onClick={() => router.push('/proposals')}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Teklifler
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-display font-extrabold text-2xl font-mono text-slate-900 dark:text-slate-100">
              {p.proposalNumber}
            </h1>
            <Badge color={statusColors[p.status] || ''} dot>
              {statusLabels[p.status] || p.status}
            </Badge>
            <span className="text-xs font-mono bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full">
              R{p.revisionNumber || 0}
            </span>
            {isExpired && p.status === 'sent' && (
              <Badge color="bg-red-100 text-red-700">
                <AlertTriangle className="w-3 h-3 mr-1 inline" />
                Süresi Dolmuş
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-400">
            {p.customer?.name || 'Müşteri'} &mdash; Oluşturulma: {formatDate(p.createdAt)} &mdash; Geçerlilik:{' '}
            <span className={isExpired ? 'text-red-600 font-semibold' : ''}>
              {formatDate(p.validUntil)}
            </span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="outline" size="sm" icon={<Download className="w-4 h-4" />} onClick={handleDownloadPdf}>
            PDF İndir
          </Button>
          <Button variant="outline" size="sm" icon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>
            Yazdır
          </Button>
          {p.status === 'draft' && (
            <Button size="sm" icon={<Send className="w-4 h-4" />} loading={sendMutation.isPending}
              onClick={() => sendMutation.mutate(undefined as any)}>
              Gönder
            </Button>
          )}
          {p.status === 'sent' && (
            <>
              <Button size="sm" icon={<CheckCircle2 className="w-4 h-4" />} loading={acceptMutation.isPending}
                onClick={() => setShowAcceptConfirm(true)}>
                Kabul Et
              </Button>
              <Button size="sm" variant="outline" icon={<XCircle className="w-4 h-4" />}
                onClick={() => setShowReject(true)}>
                Reddet
              </Button>
              <Button size="sm" variant="outline" icon={<GitBranch className="w-4 h-4" />}
                loading={revisionMutation.isPending} onClick={() => revisionMutation.mutate(undefined as any)}>
                Yeni Revizyon
              </Button>
            </>
          )}
          {p.status === 'accepted' && (
            <Button size="sm" icon={<FileCheck className="w-4 h-4" />}
              onClick={() => router.push(`/contract-engine?fromProposal=${id}`)}>
              Sözleşme Oluştur
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Müşteri"
          value={p.customer?.name || p.customerId?.slice(0, 8) + '...'}
          icon={<Building2 className="w-5 h-5 text-teal-600" />}
          color="bg-teal-50 dark:bg-teal-950/40"
        />
        <StatCard
          label="Toplam Tutar"
          value={`${currencySymbol}${Number(p.totalAmount || grandTotal).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
          icon={<DollarSign className="w-5 h-5 text-emerald-600" />}
          color="bg-emerald-50 dark:bg-emerald-950/40"
        />
        <StatCard
          label="İndirim"
          value={`%${p.discountRate || 0}`}
          icon={<Percent className="w-5 h-5 text-violet-600" />}
          color="bg-violet-50 dark:bg-violet-950/40"
        />
        <StatCard
          label="Geçerlilik"
          value={formatDate(p.validUntil)}
          icon={<Calendar className="w-5 h-5 text-amber-600" />}
          color="bg-amber-50 dark:bg-amber-950/40"
        />
      </div>

      {/* Guided UX banners */}
      {p.status === 'accepted' && (
        <div className="mb-4 p-4 bg-teal-900/30 border border-teal-700/50 rounded-xl flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-teal-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-teal-300">Teklif kabul edildi!</p>
            <p className="text-xs text-teal-400/70 mt-0.5">Bir sonraki adım: Sözleşme oluşturup müşteriye gönderin.</p>
          </div>
          <Button size="sm" onClick={() => router.push(`/contract-engine?fromProposal=${id}`)}>
            Sözleşme Oluştur →
          </Button>
        </div>
      )}
      {p.status === 'draft' && (!p.items || p.items.length === 0) && (
        <div className="mb-4 p-4 bg-amber-900/30 border border-amber-700/50 rounded-xl flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-amber-300">Teklif kalemleri eklenmemiş. Göndermeden önce en az bir kalem ekleyin.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setActiveTab('items')}>
            Kalem Ekle →
          </Button>
        </div>
      )}

      {/* Status timeline */}
      <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between">
          {timelineSteps.map((step, idx) => {
            const hasDate = !!step.date;
            const isCurrent = step.key === p.status || (step.key === 'draft' && p.status === 'draft');
            const Icon = step.icon;
            return (
              <div key={step.key} className="flex items-center flex-1 last:flex-initial">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    hasDate
                      ? step.key === 'rejected' ? 'bg-red-100 dark:bg-red-900/40' : 'bg-green-100 dark:bg-green-900/40'
                      : isCurrent ? 'bg-teal-600' : 'bg-slate-200 dark:bg-slate-700'
                  }`}>
                    <Icon className={`w-4 h-4 ${
                      hasDate
                        ? step.key === 'rejected' ? 'text-red-600' : 'text-green-600'
                        : isCurrent ? 'text-white' : 'text-slate-400'
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
              <CardHeader><CardTitle>Teklif Bilgileri</CardTitle></CardHeader>
              {/* Customer Info */}
              {p.customer && (
                <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Müşteri</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">{p.customer.name}</p>
                  {p.customer.contactName && <p className="text-sm text-slate-500">{p.customer.contactName}</p>}
                  {p.customer.email && <p className="text-sm text-slate-400">{p.customer.email}</p>}
                  {p.customer.city && <p className="text-sm text-slate-400">{p.customer.city}</p>}
                </div>
              )}

              {/* Dates & amounts */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-xs text-slate-400 mb-1">Oluşturulma Tarihi</p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{formatDateTime(p.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Geçerlilik Tarihi</p>
                  <p className={`text-sm font-medium ${isExpired ? 'text-red-600' : 'text-slate-700 dark:text-slate-300'}`}>
                    {formatDate(p.validUntil)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Para Birimi</p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{p.currency}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Revizyon</p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">R{p.revisionNumber || 0}</p>
                </div>
              </div>

              {/* Notes */}
              {p.notes && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm text-slate-600 dark:text-slate-400">
                  <strong>Notlar:</strong> {p.notes}
                </div>
              )}
            </Card>
          </div>

          {/* Side panel */}
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Özet</CardTitle></CardHeader>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Ara Toplam</span>
                  <span className="text-slate-700 dark:text-slate-300">{currencySymbol}{subtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                </div>
                {(p.discountRate || 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">İndirim (%{p.discountRate})</span>
                    <span className="text-red-600">-{currencySymbol}{discountAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">KDV (%{kdvRate})</span>
                  <span className="text-slate-700 dark:text-slate-300">{currencySymbol}{kdvAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between">
                  <span className="text-slate-400 font-semibold">Genel Toplam</span>
                  <span className="font-bold text-lg text-teal-600">
                    {currencySymbol}{Number(p.totalAmount || grandTotal).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </Card>

            {/* Status info cards */}
            {p.acceptedAt && (
              <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-xl text-sm text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <div>
                  <p className="font-semibold">Kabul Edildi</p>
                  <p className="text-xs text-green-600 dark:text-green-400">{formatDateTime(p.acceptedAt)}</p>
                </div>
              </div>
            )}
            {p.rejectedAt && (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-xl text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2 mb-1">
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                  <p className="font-semibold">Reddedildi</p>
                </div>
                <p className="text-xs text-red-600 dark:text-red-400">{formatDateTime(p.rejectedAt)}</p>
                {p.rejectionReason && (
                  <div className="mt-2 p-2 bg-red-100/50 dark:bg-red-900/20 rounded-lg">
                    <p className="text-xs font-semibold mb-0.5">Gerekçe:</p>
                    <p className="text-xs">{p.rejectionReason}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'items' && (
        <Card>
          <CardHeader>
            <CardTitle>Teklif Kalemleri ({items.length})</CardTitle>
            {p.status === 'draft' && (
              <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setShowAddItem(true)}>
                Kalem Ekle
              </Button>
            )}
          </CardHeader>
          {items.length === 0 ? (
            <EmptyState icon={<FileText className="w-10 h-10" />} title="Kalem bulunamadı"
              description="Teklife kalem ekleyerek başlayın."
              action={p.status === 'draft' ? <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setShowAddItem(true)}>Kalem Ekle</Button> : undefined}
            />
          ) : (
            <>
              <table className="w-full text-sm mb-6">
                <thead>
                  <tr className="border-b-2 border-slate-200 dark:border-slate-700">
                    <th className="text-left py-2 text-slate-500">#</th>
                    <th className="text-left py-2 text-slate-500">Açıklama</th>
                    <th className="text-right py-2 text-slate-500">Miktar</th>
                    <th className="text-right py-2 text-slate-500">Birim Fiyat</th>
                    <th className="text-right py-2 text-slate-500">İndirim %</th>
                    <th className="text-right py-2 text-slate-500">Toplam</th>
                    {p.status === 'draft' && <th className="text-right py-2 text-slate-500">İşlem</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item: any, i: number) => {
                    const lineTotal = Number(item.totalPrice) || (Number(item.unitPrice) * Number(item.quantity) * (1 - (Number(item.discountRate) || 0) / 100));
                    return (
                      <tr key={item.id || i} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-2.5 text-slate-400">{i + 1}</td>
                        <td className="py-2.5 text-slate-700 dark:text-slate-300">{item.description}</td>
                        <td className="py-2.5 text-right">{item.quantity}</td>
                        <td className="py-2.5 text-right">
                          {currencySymbol}{Number(item.unitPrice).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 text-right">%{item.discountRate || 0}</td>
                        <td className="py-2.5 text-right font-semibold">
                          {currencySymbol}{lineTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </td>
                        {p.status === 'draft' && (
                          <td className="py-2.5 text-right">
                            <button
                              onClick={() => removeItemMutation.mutate(item.id)}
                              className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-600"
                              title="Sil"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={p.status === 'draft' ? 5 : 5} className="pt-3 text-right text-sm text-slate-500">Ara Toplam:</td>
                    <td className="pt-3 text-right text-sm font-medium text-slate-700 dark:text-slate-300">
                      {currencySymbol}{subtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    {p.status === 'draft' && <td />}
                  </tr>
                  {(p.discountRate || 0) > 0 && (
                    <tr>
                      <td colSpan={p.status === 'draft' ? 5 : 5} className="pt-1 text-right text-sm text-slate-500">İndirim (%{p.discountRate}):</td>
                      <td className="pt-1 text-right text-sm text-red-600">
                        -{currencySymbol}{discountAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </td>
                      {p.status === 'draft' && <td />}
                    </tr>
                  )}
                  <tr>
                    <td colSpan={p.status === 'draft' ? 5 : 5} className="pt-1 text-right text-sm text-slate-500">KDV (%{kdvRate}):</td>
                    <td className="pt-1 text-right text-sm text-slate-700 dark:text-slate-300">
                      {currencySymbol}{kdvAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    {p.status === 'draft' && <td />}
                  </tr>
                  <tr>
                    <td colSpan={p.status === 'draft' ? 5 : 5} className="pt-3 text-right font-bold text-slate-800 dark:text-slate-200">Genel Toplam:</td>
                    <td className="pt-3 text-right font-bold text-lg text-teal-600">
                      {currencySymbol}{Number(p.totalAmount || grandTotal).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    {p.status === 'draft' && <td />}
                  </tr>
                </tfoot>
              </table>
            </>
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
                      log.toStatus === 'accepted' ? 'bg-green-500' :
                      log.toStatus === 'rejected' ? 'bg-red-500' :
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

      {/* Accept Confirmation Modal */}
      <Modal open={showAcceptConfirm} onClose={() => setShowAcceptConfirm(false)} title="Teklifi Kabul Et" size="sm">
        <p className="text-sm text-slate-400 mb-4">
          Bu teklif kabul edilecek ve otomatik olarak sözleşme taslağı oluşturulacaktır. Devam etmek istiyor musunuz?
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setShowAcceptConfirm(false)}>İptal</Button>
          <Button onClick={() => { acceptMutation.mutate(undefined as any); setShowAcceptConfirm(false); }}>Kabul Et</Button>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal open={showReject} onClose={() => { setShowReject(false); setRejectReason(''); }} title="Teklifi Reddet" size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowReject(false); setRejectReason(''); }}>İptal</Button>
            <Button variant="danger" loading={rejectMutation.isPending} disabled={!rejectReason.trim()}
              onClick={() => rejectMutation.mutate(undefined as any)}>
              Reddet
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">Bu teklifi reddetmek istediğinize emin misiniz?</p>
          </div>
          <Textarea
            label="Red Gerekçesi *"
            value={rejectReason}
            onChange={(e: any) => setRejectReason(e.target.value)}
            placeholder="Red nedenini açıklayınız..."
            rows={4}
            required
          />
        </div>
      </Modal>

      {/* Add Item Modal */}
      <Modal open={showAddItem} onClose={() => { setShowAddItem(false); resetItem(); }} title="Kalem Ekle" size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowAddItem(false); resetItem(); }}>İptal</Button>
            <Button loading={addItemMutation.isPending} onClick={submitItem((d) => addItemMutation.mutate(d))}>Ekle</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Açıklama" required className="col-span-2" {...regItem('description', { required: true })} />
          <Input label="Miktar" type="number" min={1} {...regItem('quantity', { valueAsNumber: true })} />
          <Input label="Birim Fiyat" type="number" min={0} step="0.01" {...regItem('unitPrice', { valueAsNumber: true })} />
          <Input label="İndirim %" type="number" min={0} max={100} {...regItem('discountRate', { valueAsNumber: true })} />
          <Input label="Ekipman Tipi" {...regItem('equipmentTypeName')} />
          <Textarea label="Not" {...regItem('note')} className="col-span-2" rows={2} />
        </div>
      </Modal>
    </>
  );
}
