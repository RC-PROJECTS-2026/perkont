'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { proposalsApi, customersApi, useMutationWithToast } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, SearchInput,
  SkeletonTable, EmptyState, Tabs, Modal, Input, Select, Textarea, StatCard,
} from '@/components/ui';
import { formatDate } from '@/lib/utils';
import {
  FileText, Plus, RefreshCw, Send, CheckCircle2, XCircle, Eye,
  Download, GitBranch, DollarSign, Clock, TrendingUp, Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── useDebounce hook ──────────────────────────────────────────────────────────
function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProposalItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountRate: number;
}

function generateItemId() {
  return Math.random().toString(36).slice(2, 10);
}

function createEmptyItem(): ProposalItem {
  return { id: generateItemId(), description: '', quantity: 1, unitPrice: 0, discountRate: 0 };
}

const statusColors: Record<string, string> = {
  draft:    'bg-slate-100 text-slate-500',
  sent:     'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  expired:  'bg-amber-100 text-amber-700',
};
const statusLabels: Record<string, string> = {
  draft: 'Taslak', sent: 'Gonderildi', accepted: 'Kabul Edildi',
  rejected: 'Reddedildi', expired: 'Suresi Dolmus',
};

export default function ProposalsPage() {
  const router = useRouter();
  const [tab, setTab] = useState('draft');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [confirmSend, setConfirmSend] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['proposals', tab, search],
    queryFn: () => proposalsApi.list({ status: tab === 'all' ? undefined : tab, search: search || undefined, limit: 50 }),
  });
  const proposals = (data as any)?.data?.data || [];

  // ── Create wizard state ─────────────────────────────────────────────────
  const [custSearch, setCustSearch] = useState('');
  const debouncedCustSearch = useDebounce(custSearch, 300);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [currency, setCurrency] = useState('TRY');
  const [validUntil, setValidUntil] = useState('');
  const [validityDays, setValidityDays] = useState(30);
  const [notes, setNotes] = useState('');
  const [kdvIncluded, setKdvIncluded] = useState(true);
  const [kdvRate, setKdvRate] = useState(20);
  const [items, setItems] = useState<ProposalItem[]>([createEmptyItem()]);

  const { data: customersData } = useQuery({
    queryKey: ['customers-search', debouncedCustSearch],
    queryFn: () => customersApi.list({ search: debouncedCustSearch, limit: 20 }),
    enabled: debouncedCustSearch.length >= 2,
  });
  const rawCust = (customersData as any)?.data;
  const customers = Array.isArray(rawCust) ? rawCust : (rawCust?.data || []);

  const { data: templatesData } = useQuery({
    queryKey: ['proposal-templates'],
    queryFn: () => proposalsApi.listTemplates(),
    enabled: showCreate,
  });
  const rawTmpl = (templatesData as any)?.data;
  const templates = Array.isArray(rawTmpl) ? rawTmpl : (rawTmpl?.data || []);

  // ── Stat calculations ──────────────────────────────────────────────────
  const totalCount = proposals.length;
  const pendingCount = proposals.filter((p: any) => p.status === 'sent').length;
  const acceptedCount = proposals.filter((p: any) => p.status === 'accepted').length;
  const totalValue = proposals.reduce((s: number, p: any) => s + (Number(p.totalAmount) || 0), 0);

  // ── Item calculations ──────────────────────────────────────────────────
  const calcItemTotal = (item: ProposalItem) => {
    const base = item.quantity * item.unitPrice;
    const discount = base * (item.discountRate / 100);
    return base - discount;
  };

  const subtotal = items.reduce((s, i) => s + calcItemTotal(i), 0);
  const totalDiscount = items.reduce((s, i) => {
    const base = i.quantity * i.unitPrice;
    return s + base * (i.discountRate / 100);
  }, 0);
  const kdvAmount = kdvIncluded ? subtotal * (kdvRate / 100) : 0;
  const grandTotal = subtotal + kdvAmount;

  const updateItem = (id: string, field: keyof ProposalItem, value: any) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.length <= 1 ? prev : prev.filter(i => i.id !== id));
  };

  const addItem = () => {
    setItems(prev => [...prev, createEmptyItem()]);
  };

  const resetCreateForm = () => {
    setCustSearch('');
    setSelectedCustomerId('');
    setSelectedCustomerName('');
    setSelectedTemplateId('');
    setCurrency('TRY');
    setValidUntil('');
    setValidityDays(30);
    setNotes('');
    setKdvIncluded(true);
    setKdvRate(20);
    setItems([createEmptyItem()]);
  };

  // ── Mutations ───────────────────────────────────────────────────────────
  const createMutation = useMutationWithToast(proposalsApi.create, {
    successMessage: 'Teklif olusturuldu',
    invalidateKeys: [['proposals']],
    onSuccess: (res: any) => {
      setShowCreate(false);
      resetCreateForm();
      const newId = res?.data?.id;
      if (newId) router.push(`/proposals/${newId}`);
    },
  });

  const sendMutation = useMutationWithToast(
    (id: string) => proposalsApi.send(id),
    { successMessage: 'Teklif gonderildi', invalidateKeys: [['proposals']] },
  );

  const revisionMutation = useMutationWithToast(
    (id: string) => proposalsApi.createRevision(id),
    { successMessage: 'Yeni revizyon olusturuldu', invalidateKeys: [['proposals']] },
  );

  const handleDownloadPdf = async (id: string, proposalNumber: string) => {
    try {
      const blob = await proposalsApi.getPdf(id);
      const url = window.URL.createObjectURL(blob as any);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Teklif_${proposalNumber}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('PDF indirildi');
    } catch {
      toast.error('PDF olusturulamadi');
    }
  };

  const handleCreateSubmit = (asDraft: boolean) => {
    if (!selectedCustomerId) {
      toast.error('Musteri secimi zorunludur');
      return;
    }
    const validItems = items.filter(i => i.description.trim());
    if (validItems.length === 0) {
      toast.error('En az bir kalem ekleyin');
      return;
    }

    const payload: any = {
      customerId: selectedCustomerId,
      templateId: selectedTemplateId || undefined,
      currency,
      validUntil: validUntil || undefined,
      validityDays: validityDays || 30,
      notes: notes || undefined,
      kdvIncluded,
      kdvRate,
      status: asDraft ? 'draft' : 'sent',
      items: validItems.map((i, idx) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discountRate: i.discountRate || 0,
        orderIndex: idx,
      })),
    };
    createMutation.mutate(payload);
  };

  const tabs = [
    { key: 'draft',    label: 'Taslak' },
    { key: 'sent',     label: 'Gonderildi' },
    { key: 'accepted', label: 'Kabul Edildi' },
    { key: 'rejected', label: 'Reddedildi' },
    { key: 'expired',  label: 'Suresi Dolmus' },
    { key: 'all',      label: 'Tumu' },
  ];

  const filtered = proposals.filter((p: any) =>
    !search || p.proposalNumber?.toLowerCase().includes(search.toLowerCase())
      || p.customer?.name?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title="Teklifler"
        subtitle={`${filtered.length} teklif`}
        actions={
          <>
            <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Teklif Olustur</Button>
          </>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Toplam Teklif"
          value={totalCount}
          icon={<FileText className="w-5 h-5 text-teal-600" />}
          color="bg-teal-50 dark:bg-teal-950/40"
        />
        <StatCard
          label="Bekleyen"
          value={pendingCount}
          icon={<Clock className="w-5 h-5 text-blue-600" />}
          color="bg-blue-50 dark:bg-blue-950/40"
        />
        <StatCard
          label="Kabul Edilen"
          value={acceptedCount}
          icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
          color="bg-green-50 dark:bg-green-950/40"
        />
        <StatCard
          label="Toplam Tutar"
          value={`${Number(totalValue).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`}
          icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
          color="bg-emerald-50 dark:bg-emerald-950/40"
        />
      </div>

      <div className="mb-4 flex items-center gap-4 flex-wrap">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        <div className="ml-auto">
          <SearchInput value={search} onChange={setSearch} placeholder="Teklif no veya musteri ara..." className="w-64" />
        </div>
      </div>

      <Card padding="none">
        {isLoading ? <SkeletonTable rows={6} cols={7} /> : filtered.length === 0 ? (
          <EmptyState icon={<FileText className="w-12 h-12" />} title="Teklif bulunamadi"
            description="Yeni bir teklif olusturarak baslayin."
            action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Teklif Olustur</Button>} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Teklif No</th>
                <th>Musteri</th>
                <th>Tutar</th>
                <th>Revizyon</th>
                <th>Gecerlilik</th>
                <th>Durum</th>
                <th>Islem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p: any) => {
                const isExpired = p.validUntil && new Date(p.validUntil) < new Date() && p.status === 'sent';
                return (
                  <tr key={p.id}>
                    <td>
                      <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">{p.proposalNumber}</span>
                    </td>
                    <td>
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {p.customer?.name || p.customerId?.slice(0, 8) + '...'}
                      </span>
                    </td>
                    <td>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {Number(p.totalAmount) > 0 ? `${Number(p.totalAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL` : '\u2014'}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-slate-600 dark:text-slate-400">
                        R{p.revisionNumber || 0}
                      </span>
                    </td>
                    <td>
                      <span className={`text-sm ${isExpired ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                        {formatDate(p.validUntil)}
                      </span>
                    </td>
                    <td>
                      <Badge color={statusColors[isExpired ? 'expired' : p.status] || ''} dot>
                        {isExpired ? 'Suresi Dolmus' : statusLabels[p.status] || p.status}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => router.push(`/proposals/${p.id}`)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-teal-600"
                          title="Goruntule"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {p.status === 'draft' && (
                          <button
                            onClick={() => setConfirmSend(p.id)}
                            className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-400 hover:text-blue-600"
                            title="Gonder"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDownloadPdf(p.id, p.proposalNumber)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
                          title="PDF Indir"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        {(p.status === 'sent' || p.status === 'rejected') && (
                          <button
                            onClick={() => revisionMutation.mutate(p.id)}
                            className="p-1.5 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/30 text-slate-400 hover:text-violet-600"
                            title="Yeni Revizyon"
                          >
                            <GitBranch className="w-4 h-4" />
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

      {/* ═══ Send Confirmation Modal ═══ */}
      <Modal open={!!confirmSend} onClose={() => setConfirmSend(null)} title="Teklif Gonderilsin mi?" size="sm">
        <p className="text-sm text-slate-400 mb-4">
          Bu teklif musteriye gonderilecek ve artik duzenlenemeyecektir. Devam etmek istiyor musunuz?
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmSend(null)}>Iptal</Button>
          <Button onClick={() => { sendMutation.mutate(confirmSend!); setConfirmSend(null); }}>Gonder</Button>
        </div>
      </Modal>

      {/* ═══ Create Proposal Wizard Modal ═══ */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); resetCreateForm(); }}
        title="Yeni Teklif Olustur"
        size="xl"
        footer={
          <div className="flex items-center gap-2 w-full">
            <Button variant="secondary" onClick={() => { setShowCreate(false); resetCreateForm(); }}>
              Iptal
            </Button>
            <div className="flex-1" />
            <Button
              variant="outline"
              disabled={items.filter(i => i.description.trim()).length === 0}
              onClick={() => {
                if (selectedCustomerId && items.filter(i => i.description.trim()).length > 0) {
                  toast('PDF onizleme yakinda eklenecek', { icon: '\uD83D\uDCC4' });
                }
              }}
            >
              PDF Onizle
            </Button>
            <Button
              variant="secondary"
              loading={createMutation.isPending}
              onClick={() => handleCreateSubmit(true)}
              icon={<FileText className="w-4 h-4" />}
            >
              Taslak Kaydet
            </Button>
            <Button
              loading={createMutation.isPending}
              onClick={() => handleCreateSubmit(false)}
              icon={<Send className="w-4 h-4" />}
            >
              Olustur ve Gonder
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* ── Section 1: Customer, Template, Currency, Validity ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Musteri <span className="text-red-500">*</span>
              </label>
              <input
                placeholder="En az 2 harf yazarak musteri arayin..."
                className="w-full rounded-lg border border-slate-600 bg-slate-900 text-sm text-slate-100 px-3 py-2 h-9 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                value={custSearch}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustSearch(val);
                  const selected = customers.find((c: any) => c.name === val);
                  if (selected) {
                    setSelectedCustomerId(selected.id);
                    setSelectedCustomerName(selected.name);
                  } else {
                    setSelectedCustomerId('');
                    setSelectedCustomerName('');
                  }
                }}
                list="proposal-customer-list"
              />
              <datalist id="proposal-customer-list">
                {customers.map((c: any) => <option key={c.id} value={c.name} />)}
              </datalist>
              {selectedCustomerName && (
                <p className="text-xs text-teal-500 mt-1">Secili: {selectedCustomerName}</p>
              )}
              {!selectedCustomerName && customers.length > 0 && (
                <p className="text-xs text-slate-500 mt-1">{customers.length} musteri bulundu</p>
              )}
            </div>

            <Select
              label="Sablon"
              placeholder="Sablon secin (opsiyonel)..."
              options={templates.map((t: any) => ({ value: t.id, label: t.name }))}
              value={selectedTemplateId}
              onChange={(e: any) => setSelectedTemplateId(e.target.value)}
            />
            <Select
              label="Para Birimi"
              options={[
                { value: 'TRY', label: 'TRY' },
                { value: 'USD', label: '$ USD' },
                { value: 'EUR', label: 'EUR' },
              ]}
              value={currency}
              onChange={(e: any) => setCurrency(e.target.value)}
            />
            <Input
              label="Gecerlilik (Gun)"
              type="number"
              min={1}
              value={validityDays}
              onChange={(e: any) => setValidityDays(Number(e.target.value))}
            />
            <Input
              label="Gecerlilik Tarihi"
              type="date"
              value={validUntil}
              onChange={(e: any) => setValidUntil(e.target.value)}
            />
          </div>

          {/* ── Section 2: Inline Items Table ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-200">Teklif Kalemleri</h3>
              <Button variant="outline" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={addItem}>
                Kalem Ekle
              </Button>
            </div>

            <div className="border border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800/60">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-400 w-[40%]">Aciklama</th>
                    <th className="text-center px-2 py-2 text-xs font-semibold text-slate-400 w-[10%]">Miktar</th>
                    <th className="text-center px-2 py-2 text-xs font-semibold text-slate-400 w-[15%]">Birim Fiyat</th>
                    <th className="text-center px-2 py-2 text-xs font-semibold text-slate-400 w-[10%]">Isk. %</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-slate-400 w-[17%]">Toplam</th>
                    <th className="w-[8%]" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.id} className="border-t border-slate-700/50">
                      <td className="px-2 py-1.5">
                        <input
                          className="w-full bg-transparent border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
                          placeholder={`Kalem ${idx + 1} aciklamasi...`}
                          value={item.description}
                          onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                        />
                      </td>
                      <td className="px-1 py-1.5">
                        <input
                          type="number"
                          min={1}
                          className="w-full bg-transparent border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-100 text-center focus:outline-none focus:border-teal-500"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, 'quantity', Math.max(1, Number(e.target.value) || 1))}
                        />
                      </td>
                      <td className="px-1 py-1.5">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="w-full bg-transparent border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-100 text-right focus:outline-none focus:border-teal-500"
                          value={item.unitPrice || ''}
                          onChange={(e) => updateItem(item.id, 'unitPrice', Number(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-1 py-1.5">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className="w-full bg-transparent border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-100 text-center focus:outline-none focus:border-teal-500"
                          value={item.discountRate || ''}
                          onChange={(e) => updateItem(item.id, 'discountRate', Math.min(100, Number(e.target.value) || 0))}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <span className="text-sm font-semibold text-slate-200">
                          {calcItemTotal(item).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
                          disabled={items.length <= 1}
                          title="Kalemi sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="border-t border-slate-700 bg-slate-800/40 px-4 py-3">
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-8 text-sm">
                    <span className="text-slate-400">Ara Toplam:</span>
                    <span className="text-slate-200 font-semibold w-28 text-right">
                      {subtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {totalDiscount > 0 && (
                    <div className="flex items-center gap-8 text-sm">
                      <span className="text-slate-400">Iskonto:</span>
                      <span className="text-red-400 font-semibold w-28 text-right">
                        -{totalDiscount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-sm">
                    <label className="flex items-center gap-2 text-slate-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={kdvIncluded}
                        onChange={(e) => setKdvIncluded(e.target.checked)}
                        className="rounded border-slate-600"
                      />
                      KDV (%{kdvRate}):
                    </label>
                    <span className="text-slate-200 font-semibold w-28 text-right">
                      {kdvIncluded ? kdvAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '\u2014'}
                    </span>
                  </div>
                  <div className="flex items-center gap-8 text-sm border-t border-slate-600 pt-2 mt-1">
                    <span className="text-slate-200 font-bold">Genel Toplam:</span>
                    <span className="text-teal-400 font-bold text-base w-28 text-right">
                      {grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currency}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Section 3: Notes ── */}
          <div>
            <Textarea
              label="Notlar"
              value={notes}
              onChange={(e: any) => setNotes(e.target.value)}
              placeholder="Teklif ile ilgili ek notlar..."
              rows={2}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
