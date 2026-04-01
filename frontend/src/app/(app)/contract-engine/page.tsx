'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { contractEngineApi, customersApi, proposalsApi, useMutationWithToast } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, SearchInput,
  SkeletonTable, EmptyState, Tabs, Modal, Input, Select, Textarea, StatCard,
} from '@/components/ui';
import { formatDate } from '@/lib/utils';
import {
  FileCheck, Plus, RefreshCw, Send, Eye, Download, Upload,
  CheckCircle2, AlertTriangle, Zap, DollarSign, Clock, TrendingUp,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

const statusColors: Record<string, string> = {
  draft:    'bg-slate-100 text-slate-500',
  sent:     'bg-blue-100 text-blue-700',
  signed:   'bg-emerald-100 text-emerald-700',
  active:   'bg-green-100 text-green-700',
  expired:  'bg-amber-100 text-amber-700',
};
const statusLabels: Record<string, string> = {
  draft: 'Taslak', sent: 'Gönderildi', signed: 'İmzalandı',
  active: 'Aktif', expired: 'Süresi Dolmuş',
};

export default function ContractEnginePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromProposalId = searchParams.get('fromProposal');

  const [tab, setTab] = useState('draft');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showFromProposal, setShowFromProposal] = useState(false);
  const [uploadModal, setUploadModal] = useState<any>(null);
  const [docUploadModal, setDocUploadModal] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);

  // Auto-open from-proposal modal
  useEffect(() => {
    if (fromProposalId) setShowFromProposal(true);
  }, [fromProposalId]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['contract-engine', tab, search],
    queryFn: () => contractEngineApi.list({ status: tab === 'all' ? undefined : tab, search: search || undefined, limit: 50 }),
  });
  const contracts = (data as any)?.data?.data || [];

  const [custSearch, setCustSearch] = useState('');
  const { data: customersData } = useQuery({
    queryKey: ['customers-select', custSearch],
    queryFn: () => customersApi.list({ search: custSearch || undefined, limit: 50 }),
    enabled: showCreate || custSearch.length >= 2,
  });
  const rawCust = (customersData as any)?.data;
  const customers = Array.isArray(rawCust) ? rawCust : (rawCust?.data || []);

  const { data: proposalData } = useQuery({
    queryKey: ['proposal-for-contract', fromProposalId],
    queryFn: () => proposalsApi.get(fromProposalId!),
    enabled: !!fromProposalId,
  });
  const proposal = (proposalData as any)?.data;

  const { data: templatesData } = useQuery({
    queryKey: ['contract-templates'],
    queryFn: () => contractEngineApi.list({ type: 'templates' }),
    enabled: showCreate,
  });
  // Contract templates from /contract-engine/templates endpoint
  const { data: ctTemplates } = useQuery({
    queryKey: ['contract-engine-templates'],
    queryFn: () => fetch('/api/v1/contract-engine/templates', { headers: { Authorization: `Bearer ${localStorage.getItem('perkont-auth') ? JSON.parse(localStorage.getItem('perkont-auth')!).state?.accessToken : ''}` } }).then(r => r.json()).catch(() => ({ data: [] })),
    enabled: showCreate,
  });

  const totalCount = contracts.length;
  const activeCount = contracts.filter((c: any) => c.status === 'active').length;
  const pendingCount = contracts.filter((c: any) => c.status === 'sent' || c.status === 'draft').length;
  const totalValue = contracts.reduce((s: number, c: any) => s + (Number(c.totalAmount) || 0), 0);

  const { register, handleSubmit, reset, setValue } = useForm<any>({ defaultValues: { currency: 'TRY' } });
  const { register: regFromP, handleSubmit: submitFromP, reset: resetFromP } = useForm<any>();

  const createMutation = useMutationWithToast(contractEngineApi.create, {
    successMessage: 'Sözleşme oluşturuldu',
    invalidateKeys: [['contract-engine']],
    onSuccess: (res: any) => {
      setShowCreate(false);
      reset();
      const newId = res?.data?.id;
      if (newId) router.push(`/contract-engine/${newId}`);
    },
  });

  const createFromProposalMutation = useMutationWithToast(
    (d: any) => contractEngineApi.createFromProposal(fromProposalId!, d),
    {
      successMessage: 'Tekliften sözleşme oluşturuldu',
      invalidateKeys: [['contract-engine']],
      onSuccess: (res: any) => {
        setShowFromProposal(false);
        resetFromP();
        const newId = res?.data?.id;
        if (newId) router.push(`/contract-engine/${newId}`);
      },
    },
  );

  const sendMutation = useMutationWithToast(
    (id: string) => contractEngineApi.send(id),
    { successMessage: 'Sözleşme gönderildi', invalidateKeys: [['contract-engine']] },
  );

  const activateMutation = useMutationWithToast(
    (id: string) => contractEngineApi.activate(id),
    { successMessage: 'Sözleşme aktifleştirildi', invalidateKeys: [['contract-engine']] },
  );

  const docUploadMutation = useMutationWithToast(
    ({ id, file }: any) => contractEngineApi.uploadDocument(id, file),
    {
      successMessage: 'Sözleşme belgesi yüklendi',
      invalidateKeys: [['contract-engine']],
      onSuccess: () => { setDocUploadModal(null); setDocFile(null); },
    },
  );

  const uploadMutation = useMutationWithToast(
    ({ id, file }: any) => contractEngineApi.uploadSigned(id, file),
    {
      successMessage: 'İmzalı belge yüklendi',
      invalidateKeys: [['contract-engine']],
      onSuccess: () => { setUploadModal(null); setSelectedFile(null); },
    },
  );

  const handleDownloadPdf = async (id: string, contractNumber: string) => {
    try {
      const blob = await contractEngineApi.getPdf(id);
      const url = window.URL.createObjectURL(blob as any);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Sozlesme_${contractNumber}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('PDF indirildi');
    } catch {
      toast.error('PDF oluşturulamadı');
    }
  };

  const tabs = [
    { key: 'draft',   label: 'Taslak' },
    { key: 'sent',    label: 'Gönderildi' },
    { key: 'signed',  label: 'İmzalandı' },
    { key: 'active',  label: 'Aktif' },
    { key: 'expired', label: 'Süresi Dolmuş' },
    { key: 'all',     label: 'Tümü' },
  ];

  const filtered = contracts.filter((c: any) =>
    !search || c.contractNumber?.toLowerCase().includes(search.toLowerCase())
      || c.customer?.name?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title="Sözleşme Motoru"
        subtitle={`${filtered.length} sözleşme`}
        actions={
          <>
            <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Sözleşme Oluştur</Button>
          </>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Toplam Sözleşme"
          value={totalCount}
          icon={<FileCheck className="w-5 h-5 text-teal-600" />}
          color="bg-teal-50 dark:bg-teal-950/40"
        />
        <StatCard
          label="Aktif"
          value={activeCount}
          icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
          color="bg-green-50 dark:bg-green-950/40"
        />
        <StatCard
          label="Bekleyen"
          value={pendingCount}
          icon={<Clock className="w-5 h-5 text-blue-600" />}
          color="bg-blue-50 dark:bg-blue-950/40"
        />
        <StatCard
          label="Toplam Tutar"
          value={`₺${totalValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}
          icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
          color="bg-emerald-50 dark:bg-emerald-950/40"
        />
      </div>

      <div className="mb-4 flex items-center gap-4 flex-wrap">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        <div className="ml-auto">
          <SearchInput value={search} onChange={setSearch} placeholder="Sözleşme no veya müşteri ara..." className="w-64" />
        </div>
      </div>

      <Card padding="none">
        {isLoading ? <SkeletonTable rows={6} cols={7} /> : filtered.length === 0 ? (
          <EmptyState icon={<FileCheck className="w-12 h-12" />} title="Sözleşme bulunamadı"
            description="Yeni bir sözleşme oluşturarak başlayın."
            action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Sözleşme Oluştur</Button>} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Sözleşme No</th>
                <th>Müşteri</th>
                <th>Başlangıç</th>
                <th>Bitiş</th>
                <th>Tutar</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: any) => {
                const daysToEnd = c.endDate ? Math.ceil((new Date(c.endDate).getTime() - Date.now()) / 86400000) : null;
                const isNearExpiry = daysToEnd !== null && daysToEnd > 0 && daysToEnd <= 60;
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">{c.contractNumber}</span>
                        {c.proposalId && (
                          <span className="text-xs bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 px-1.5 py-0.5 rounded-full">
                            Tekliften
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {c.customer?.name || c.customerId?.slice(0, 8) + '...'}
                      </span>
                    </td>
                    <td><span className="text-sm text-slate-500">{formatDate(c.startDate)}</span></td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {isNearExpiry && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                        <span className={`text-sm ${isNearExpiry ? 'text-amber-600 font-medium' : 'text-slate-500'}`}>
                          {formatDate(c.endDate)}
                        </span>
                        {isNearExpiry && <span className="text-xs text-amber-500">{daysToEnd}g</span>}
                      </div>
                    </td>
                    <td>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {Number(c.totalAmount) > 0 ? `₺${Number(c.totalAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '—'}
                      </span>
                    </td>
                    <td>
                      <Badge color={statusColors[c.status] || ''} dot>
                        {statusLabels[c.status] || c.status}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => router.push(`/contract-engine/${c.id}`)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-teal-600"
                          title="Görüntüle"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDownloadPdf(c.id, c.contractNumber)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
                          title="PDF İndir"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDocUploadModal(c)}
                          className="p-1.5 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-900/30 text-slate-400 hover:text-teal-600"
                          title="Sözleşme Belgesi Yükle (Word/PDF)"
                        >
                          <FileCheck className="w-4 h-4" />
                        </button>
                        {c.status === 'draft' && (
                          <button
                            onClick={() => sendMutation.mutate(c.id)}
                            className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-400 hover:text-blue-600"
                            title="Gönder"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        {(c.status === 'sent' || c.status === 'draft') && (
                          <button
                            onClick={() => setUploadModal(c)}
                            className="p-1.5 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/30 text-slate-400 hover:text-violet-600"
                            title="İmzalı Belge Yükle"
                          >
                            <Upload className="w-4 h-4" />
                          </button>
                        )}
                        {c.status === 'signed' && (
                          <button
                            onClick={() => activateMutation.mutate(c.id)}
                            className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 text-slate-400 hover:text-green-600"
                            title="Aktifleştir"
                          >
                            <Zap className="w-4 h-4" />
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

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); }} title="Yeni Sözleşme Oluştur" size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowCreate(false); reset(); }}>İptal</Button>
            <Button loading={createMutation.isPending} onClick={handleSubmit((d) => {
              if (!d.customerId) { toast.error('Müşteri seçimi zorunludur'); return; }
              if (!d.startDate) { toast.error('Başlangıç tarihi zorunludur'); return; }
              createMutation.mutate(d);
            })}>Oluştur</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Müşteri <span className="text-red-500">*</span></label>
            <input
              placeholder="En az 2 harf yazarak müşteri arayın..."
              className="w-full rounded-lg border border-slate-600 bg-slate-900 text-sm text-slate-100 px-3 py-2 h-9 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
              onChange={(e) => {
                const val = e.target.value;
                if (val.length >= 2) setCustSearch(val);
                const selected = customers.find((c: any) => c.name === val);
                if (selected) setValue('customerId', selected.id);
              }}
              list="contract-customer-list"
            />
            <datalist id="contract-customer-list">
              {customers.map((c: any) => <option key={c.id} value={c.name} />)}
            </datalist>
            {customers.length > 0 && <p className="text-xs text-slate-500 mt-1">{customers.length} müşteri bulundu</p>}
          </div>
          <Input label="Başlangıç Tarihi" type="date" required {...register('startDate', { required: true })} />
          <Input label="Bitiş Tarihi" type="date" required {...register('endDate', { required: true })} />
          <Input label="Toplam Tutar" type="number" step="0.01" {...register('totalAmount', { valueAsNumber: true })} />
          <Select
            label="Para Birimi"
            options={[
              { value: 'TRY', label: '₺ TRY' },
              { value: 'USD', label: '$ USD' },
              { value: 'EUR', label: '€ EUR' },
            ]}
            {...register('currency')}
          />
          <Textarea label="Özel Koşullar" {...register('specialConditions')} className="col-span-2" rows={3} />
          <Textarea label="Notlar" {...register('notes')} className="col-span-2" rows={2} />
        </div>
      </Modal>

      {/* From Proposal Modal */}
      <Modal
        open={showFromProposal}
        onClose={() => { setShowFromProposal(false); resetFromP(); router.replace('/contract-engine'); }}
        title="Tekliften Sözleşme Oluştur"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowFromProposal(false); router.replace('/contract-engine'); }}>İptal</Button>
            <Button loading={createFromProposalMutation.isPending} onClick={submitFromP((d) => createFromProposalMutation.mutate(d))}>
              Sözleşme Oluştur
            </Button>
          </>
        }
      >
        {proposal ? (
          <div className="space-y-4">
            <div className="p-4 bg-teal-50 dark:bg-teal-950/30 rounded-xl border border-teal-200 dark:border-teal-800">
              <p className="text-sm text-teal-700 dark:text-teal-300">
                <strong>{proposal.proposalNumber}</strong> numaralı tekliften sözleşme oluşturulacak.
              </p>
              <p className="text-xs text-teal-600 dark:text-teal-400 mt-1">
                Müşteri: {proposal.customer?.name} &mdash; Tutar: ₺{Number(proposal.totalAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Başlangıç Tarihi" type="date" required {...regFromP('startDate', { required: true })} />
              <Input label="Bitiş Tarihi" type="date" required {...regFromP('endDate', { required: true })} />
              <Textarea label="Özel Koşullar" {...regFromP('specialConditions')} className="col-span-2" rows={3} />
              <Textarea label="Notlar" {...regFromP('notes')} className="col-span-2" rows={2} />
            </div>
          </div>
        ) : (
          <div className="h-32 skeleton rounded-xl" />
        )}
      </Modal>

      {/* Document Upload Modal (Word/PDF) */}
      <Modal
        open={!!docUploadModal}
        onClose={() => { setDocUploadModal(null); setDocFile(null); }}
        title={`Sözleşme Belgesi Yükle — ${docUploadModal?.contractNumber}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setDocUploadModal(null); setDocFile(null); }}>İptal</Button>
            <Button loading={docUploadMutation.isPending} disabled={!docFile}
              onClick={() => docUploadMutation.mutate({ id: docUploadModal?.id, file: docFile })}>
              Yükle
            </Button>
          </>
        }
      >
        <div
          className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-teal-400 transition-colors"
          onClick={() => document.getElementById('ce-doc-upload')?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setDocFile(f); }}
        >
          <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          {docFile ? (
            <p className="text-sm font-semibold text-teal-600">{docFile.name}</p>
          ) : (
            <>
              <p className="text-sm text-slate-500">Word veya PDF belgesi sürükleyin veya seçin</p>
              <p className="text-xs text-slate-400 mt-1">.docx, .doc, .pdf — maks. 10MB</p>
            </>
          )}
          <input
            id="ce-doc-upload"
            type="file"
            accept=".pdf,.docx,.doc"
            className="hidden"
            onChange={(e) => setDocFile(e.target.files?.[0] || null)}
          />
        </div>
      </Modal>

      {/* Upload Signed Modal */}
      <Modal
        open={!!uploadModal}
        onClose={() => { setUploadModal(null); setSelectedFile(null); }}
        title={`İmzalı Belge Yükle — ${uploadModal?.contractNumber}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setUploadModal(null); setSelectedFile(null); }}>İptal</Button>
            <Button loading={uploadMutation.isPending} disabled={!selectedFile}
              onClick={() => uploadMutation.mutate({ id: uploadModal?.id, file: selectedFile })}>
              Yükle
            </Button>
          </>
        }
      >
        <div
          className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-teal-400 transition-colors"
          onClick={() => document.getElementById('ce-upload')?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) setSelectedFile(file);
          }}
        >
          <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          {selectedFile ? (
            <p className="text-sm font-semibold text-teal-600">{selectedFile.name}</p>
          ) : (
            <>
              <p className="text-sm text-slate-500">İmzalı belgeyi sürükleyin veya seçin</p>
              <p className="text-xs text-slate-400 mt-1">.pdf, .docx — maks. 10MB</p>
            </>
          )}
          <input
            id="ce-upload"
            type="file"
            accept=".pdf,.docx,.doc"
            className="hidden"
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
          />
        </div>
      </Modal>
    </>
  );
}
