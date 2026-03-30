'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useMutationWithToast } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, Modal, Input, Textarea, Select,
  SkeletonTable, EmptyState, Tabs, StatCard,
} from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { ClipboardCheck, Plus, RefreshCw, Shield, AlertTriangle } from 'lucide-react';
import { useForm } from 'react-hook-form';

/* ── Risk constants ─────────────────────────────────────────── */
const CATEGORIES: Record<string, string> = {
  impartiality: 'Tarafsızlık', technical: 'Teknik', operational: 'Operasyonel',
  financial: 'Finansal', legal: 'Hukuki', reputational: 'İtibar',
};
const RISK_STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-100 text-red-700', monitoring: 'bg-amber-100 text-amber-700',
  mitigated: 'bg-blue-100 text-blue-700', closed: 'bg-green-100 text-green-700',
};
const RISK_STATUS_LABELS: Record<string, string> = { open: 'Açık', monitoring: 'İzlemede', mitigated: 'Azaltıldı', closed: 'Kapatıldı' };

function scoreColor(score: number) {
  if (score >= 15) return 'bg-red-100 text-red-700 font-bold';
  if (score >= 8) return 'bg-amber-100 text-amber-700 font-bold';
  return 'bg-green-100 text-green-700 font-bold';
}

function heatmapCellColor(count: number) {
  if (count === 0) return 'bg-slate-100 dark:bg-slate-800 text-slate-400';
  if (count <= 2) return 'bg-green-100 dark:bg-green-900/40 text-green-700';
  if (count <= 4) return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700';
  return 'bg-red-100 dark:bg-red-900/40 text-red-700';
}

/* ── YGG constants ──────────────────────────────────────────── */
const yggStatusColors: Record<string, string> = {
  planned:   'bg-slate-100 text-slate-500',
  completed: 'bg-green-100 text-green-700',
};
const yggStatusLabels: Record<string, string> = { planned: 'Planlandı', completed: 'Tamamlandı' };

export default function YggPage() {
  const [activeTab, setActiveTab] = useState('risk');

  /* ── Risk state ─────────────────────────── */
  const [riskTab, setRiskTab] = useState('open');
  const [showCreateRisk, setShowCreateRisk] = useState(false);

  const { data: riskData, isLoading: riskLoading, refetch: refetchRisk } = useQuery({
    queryKey: ['risk', riskTab],
    queryFn: () => apiClient.get(`/risk`, { params: { status: riskTab === 'all' ? undefined : riskTab, limit: 50 } }),
  });
  const { data: riskStatsData } = useQuery({ queryKey: ['risk-stats'], queryFn: () => apiClient.get('/risk/stats') });
  const { data: heatmapData } = useQuery({ queryKey: ['risk-heatmap'], queryFn: () => apiClient.get('/risk/heatmap') });

  const riskItems = (riskData as any)?.data?.data || [];
  const riskStats = (riskStatsData as any)?.data || {};
  const heatmap = (heatmapData as any)?.data || {};

  const { register: riskReg, handleSubmit: riskSubmit, reset: riskReset } = useForm<any>({ defaultValues: { likelihood: 3, impact: 3 } });

  const createRiskMutation = useMutationWithToast(
    (d: any) => apiClient.post('/risk', d),
    { successMessage: 'Risk kaydı oluşturuldu', invalidateKeys: [['risk'], ['risk-stats'], ['risk-heatmap']], onSuccess: () => { setShowCreateRisk(false); riskReset(); } },
  );

  const riskTabs = [
    { key: 'open', label: 'Açık', count: riskStats.open || 0 },
    { key: 'monitoring', label: 'İzlemede' },
    { key: 'mitigated', label: 'Azaltıldı' },
    { key: 'all', label: 'Tümü' },
  ];

  /* ── YGG state ──────────────────────────── */
  const [showCreateYgg, setShowCreateYgg] = useState(false);

  const { data: yggData, isLoading: yggLoading, refetch: refetchYgg } = useQuery({
    queryKey: ['ygg-records'],
    queryFn: () => apiClient.get('/personnel/management-reviews'),
  });
  const yggRecords = (yggData as any)?.data?.data || (yggData as any)?.data || [];

  const { register: yggReg, handleSubmit: yggSubmit, reset: yggReset } = useForm<any>();

  const createYggMutation = useMutationWithToast(
    (d: any) => apiClient.post('/personnel/management-reviews', d),
    { successMessage: 'YGG kaydı oluşturuldu', invalidateKeys: [['ygg-records']], onSuccess: () => { setShowCreateYgg(false); yggReset(); } },
  );

  /* ── Heatmap grid helper ────────────────── */
  const heatmapGrid = heatmap.grid || null;
  const renderHeatmap = () => {
    // Build a 5x5 grid: rows = impact (5 to 1), cols = likelihood (1 to 5)
    const grid: number[][] = [];
    for (let impact = 5; impact >= 1; impact--) {
      const row: number[] = [];
      for (let likelihood = 1; likelihood <= 5; likelihood++) {
        const key = `${likelihood}_${impact}`;
        row.push(heatmapGrid?.[key] || 0);
      }
      grid.push(row);
    }
    return (
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="p-2 text-xs text-slate-400 text-right w-20">Etki ↓ / Olasılık →</th>
              {[1, 2, 3, 4, 5].map(l => (
                <th key={l} className="p-2 text-xs text-slate-500 text-center w-14">{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, ri) => (
              <tr key={ri}>
                <td className="p-2 text-xs text-slate-500 text-right font-semibold">{5 - ri}</td>
                {row.map((count, ci) => {
                  const score = (ci + 1) * (5 - ri);
                  return (
                    <td key={ci} className="p-1">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-sm font-bold ${
                        score >= 15 ? (count > 0 ? 'bg-red-200 dark:bg-red-900/60 text-red-800' : 'bg-red-50 dark:bg-red-950/20 text-red-300')
                        : score >= 8 ? (count > 0 ? 'bg-amber-200 dark:bg-amber-900/60 text-amber-800' : 'bg-amber-50 dark:bg-amber-950/20 text-amber-300')
                        : (count > 0 ? 'bg-green-200 dark:bg-green-900/60 text-green-800' : 'bg-green-50 dark:bg-green-950/20 text-green-300')
                      }`}>
                        {count > 0 ? count : ''}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200 dark:bg-green-900/60" /> Düşük (1-7)</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-200 dark:bg-amber-900/60" /> Orta (8-14)</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 dark:bg-red-900/60" /> Yüksek (15-25)</span>
        </div>
      </div>
    );
  };

  const mainTabs = [
    { key: 'risk', label: 'Risk Kaydı', count: riskStats.total || 0 },
    { key: 'ygg',  label: 'Yönetimin Gözden Geçirmesi (YGG)', count: yggRecords.length },
  ];

  const handleRefetch = () => {
    if (activeTab === 'risk') refetchRisk();
    else refetchYgg();
  };

  return (
    <>
      <PageHeader
        title="Risk ve YGG"
        subtitle="ISO/IEC 17020 Madde 8 — Risk yönetimi ve yönetimin gözden geçirmesi"
        actions={
          <>
            <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={handleRefetch}>Yenile</Button>
            {activeTab === 'risk' && (
              <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateRisk(true)}>Risk Ekle</Button>
            )}
            {activeTab === 'ygg' && (
              <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateYgg(true)}>YGG Oluştur</Button>
            )}
          </>
        }
      />

      <div className="mb-6">
        <Tabs tabs={mainTabs} active={activeTab} onChange={setActiveTab} />
      </div>

      {/* ═══════ RISK TAB ═══════ */}
      {activeTab === 'risk' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <StatCard label="Toplam" value={riskStats.total || 0}
              icon={<Shield className="w-5 h-5 text-slate-600" />} color="bg-slate-50 dark:bg-slate-800" />
            <StatCard label="Açık" value={riskStats.open || 0}
              icon={<AlertTriangle className="w-5 h-5 text-red-600" />} color="bg-red-50 dark:bg-red-950/40" />
            <StatCard label="Yüksek Risk (≥15)" value={riskStats.high || 0}
              icon={<AlertTriangle className="w-5 h-5 text-amber-600" />} color="bg-amber-50 dark:bg-amber-950/40" />
          </div>

          {/* Heatmap */}
          <Card className="mb-6">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Risk Matrisi (5×5)</h3>
            {renderHeatmap()}
          </Card>

          {/* Risk filter tabs */}
          <div className="mb-4">
            <Tabs tabs={riskTabs} active={riskTab} onChange={setRiskTab} />
          </div>

          {/* Risk table */}
          <Card padding="none">
            {riskLoading ? <SkeletonTable rows={5} cols={7} /> : riskItems.length === 0 ? (
              <EmptyState icon={<Shield className="w-12 h-12" />} title="Risk kaydı yok"
                action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateRisk(true)}>Ekle</Button>} />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Risk No</th>
                    <th>Kategori</th>
                    <th>Başlık</th>
                    <th>Olasılık</th>
                    <th>Etki</th>
                    <th>Risk Skoru</th>
                    <th>İşlem</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {riskItems.map((r: any) => {
                    const score = (r.likelihood || 0) * (r.impact || 0);
                    return (
                      <tr key={r.id}>
                        <td><span className="font-mono text-xs font-semibold">{r.riskNumber}</span></td>
                        <td><Badge color="bg-slate-100 text-slate-600">{CATEGORIES[r.category] || r.category}</Badge></td>
                        <td>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 max-w-xs line-clamp-2">{r.title}</p>
                          {r.description && <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{r.description}</p>}
                        </td>
                        <td><span className="text-sm font-semibold">{r.likelihood}/5</span></td>
                        <td><span className="text-sm font-semibold">{r.impact}/5</span></td>
                        <td><Badge color={scoreColor(score)}>{score}</Badge></td>
                        <td><span className="text-xs text-slate-500">{r.treatment || '—'}</span></td>
                        <td><Badge color={RISK_STATUS_COLORS[r.status] || ''} dot>{RISK_STATUS_LABELS[r.status] || r.status}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}

      {/* ═══════ YGG TAB ═══════ */}
      {activeTab === 'ygg' && (
        <Card padding="none">
          {yggLoading ? <SkeletonTable rows={4} cols={6} /> : yggRecords.length === 0 ? (
            <EmptyState icon={<ClipboardCheck className="w-12 h-12" />} title="YGG kaydı yok"
              action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateYgg(true)}>Oluştur</Button>} />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Toplantı No</th>
                  <th>Başlık</th>
                  <th>Tarih</th>
                  <th>Katılımcılar</th>
                  <th>Durum</th>
                  <th>Kararlar</th>
                </tr>
              </thead>
              <tbody>
                {yggRecords.map((r: any, idx: number) => (
                  <tr key={r.id}>
                    <td><span className="font-mono text-xs font-semibold">YGG-{String(idx + 1).padStart(3, '0')}</span></td>
                    <td>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{r.title}</p>
                      {r.agenda && <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{r.agenda}</p>}
                    </td>
                    <td>
                      <span className="text-sm text-slate-500">{formatDate(r.actualDate || r.plannedDate)}</span>
                    </td>
                    <td><span className="text-sm text-slate-500">{r.attendees?.join(', ') || '—'}</span></td>
                    <td><Badge color={yggStatusColors[r.status] || ''} dot>{yggStatusLabels[r.status] || r.status}</Badge></td>
                    <td>
                      {r.decisions ? (
                        <p className="text-xs text-slate-500 line-clamp-2 max-w-xs">{r.decisions}</p>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* ═══════ Create Risk Modal ═══════ */}
      <Modal open={showCreateRisk} onClose={() => { setShowCreateRisk(false); riskReset(); }} title="Yeni Risk" size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateRisk(false)}>İptal</Button>
            <Button loading={createRiskMutation.isPending}
              onClick={riskSubmit((d) => createRiskMutation.mutate({ ...d, likelihood: Number(d.likelihood), impact: Number(d.impact) }))}>
              Kaydet
            </Button>
          </>
        }>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Kategori" required options={Object.entries(CATEGORIES).map(([v, l]) => ({ value: v, label: l }))} {...riskReg('category', { required: true })} />
          <Input label="Başlık" required {...riskReg('title', { required: true })} />
          <Textarea label="Açıklama" required {...riskReg('description', { required: true })} className="col-span-2" rows={2} />
          <Select label="Olasılık (1-5)" options={[1, 2, 3, 4, 5].map(v => ({ value: String(v), label: `${v}` }))} {...riskReg('likelihood')} />
          <Select label="Etki (1-5)" options={[1, 2, 3, 4, 5].map(v => ({ value: String(v), label: `${v}` }))} {...riskReg('impact')} />
          <Select label="Tedavi" options={[{ value: 'mitigate', label: 'Azalt' }, { value: 'accept', label: 'Kabul' }, { value: 'transfer', label: 'Transfer' }, { value: 'avoid', label: 'Kaçın' }]} {...riskReg('treatment')} />
          <Input label="Hedef Tarih" type="date" {...riskReg('targetDate')} />
          <Textarea label="Azaltma Planı" {...riskReg('mitigationPlan')} className="col-span-2" rows={2} />
        </div>
      </Modal>

      {/* ═══════ Create YGG Modal ═══════ */}
      <Modal open={showCreateYgg} onClose={() => { setShowCreateYgg(false); yggReset(); }} title="YGG Toplantısı Oluştur" size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateYgg(false)}>İptal</Button>
            <Button loading={createYggMutation.isPending} onClick={yggSubmit((d) => createYggMutation.mutate(d))}>Oluştur</Button>
          </>
        }>
        <div className="space-y-4">
          <Input label="Toplantı Başlığı" required {...yggReg('title', { required: true })} />
          <Input label="Planlanan Tarih" type="date" required {...yggReg('plannedDate', { required: true })} />
          <Textarea label="Gündem" {...yggReg('agenda')} rows={3} placeholder="Görüşülecek konular..." />
          <Input label="Katılımcılar (virgülle ayırın)" {...yggReg('attendees')} placeholder="Ad Soyad, Ad Soyad..." />
        </div>
      </Modal>
    </>
  );
}
