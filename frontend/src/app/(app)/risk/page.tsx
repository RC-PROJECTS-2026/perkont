'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useMutationWithToast } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, SkeletonTable, EmptyState,
  Modal, Input, Select, Textarea, StatCard, Tabs, SearchInput,
} from '@/components/ui';
import { AlertTriangle, Plus, RefreshCw, Shield } from 'lucide-react';
import { useForm } from 'react-hook-form';

const CATEGORIES: Record<string, string> = {
  impartiality: 'Tarafsızlık', technical: 'Teknik', operational: 'Operasyonel',
  financial: 'Finansal', legal: 'Hukuki', reputational: 'İtibar',
};
const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-100 text-red-700', monitoring: 'bg-amber-100 text-amber-700',
  mitigated: 'bg-blue-100 text-blue-700', closed: 'bg-green-100 text-green-700',
};
const STATUS_LABELS: Record<string, string> = { open: 'Açık', monitoring: 'İzlemede', mitigated: 'Azaltıldı', closed: 'Kapatıldı' };

function scoreColor(score: number) {
  if (score >= 15) return 'bg-red-100 text-red-700 font-bold';
  if (score >= 8) return 'bg-amber-100 text-amber-700 font-bold';
  return 'bg-green-100 text-green-700 font-bold';
}

export default function RiskPage() {
  const [tab, setTab] = useState('open');
  const [category, setCategory] = useState('');
  const [showCreate, setCreate] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['risk', tab, category],
    queryFn: () => apiClient.get('/risk', { params: { status: tab === 'all' ? undefined : tab, category: category || undefined, limit: 50 } }),
  });
  const { data: statsData } = useQuery({ queryKey: ['risk-stats'], queryFn: () => apiClient.get('/risk/stats') });
  const { data: heatmapData } = useQuery({ queryKey: ['risk-heatmap'], queryFn: () => apiClient.get('/risk/heatmap') });

  const items = (data as any)?.data?.data || [];
  const stats = (statsData as any)?.data || {};
  const heatmapGrid = (heatmapData as any)?.data?.grid || {};

  const { register, handleSubmit, reset } = useForm<any>({ defaultValues: { likelihood: 3, impact: 3 } });

  const createMutation = useMutationWithToast(
    (d: any) => apiClient.post('/risk', d),
    { successMessage: 'Risk kaydı oluşturuldu', invalidateKeys: [['risk'], ['risk-stats'], ['risk-heatmap']], onSuccess: () => { setCreate(false); reset(); } },
  );

  const tabs = [
    { key: 'open', label: 'Açık', count: stats.open || 0 },
    { key: 'monitoring', label: 'İzlemede' },
    { key: 'mitigated', label: 'Azaltıldı' },
    { key: 'all', label: 'Tümü' },
  ];

  /* 5x5 Heatmap */
  const renderHeatmap = () => {
    const grid: number[][] = [];
    for (let impact = 5; impact >= 1; impact--) {
      const row: number[] = [];
      for (let likelihood = 1; likelihood <= 5; likelihood++) {
        const key = `${likelihood}_${impact}`;
        row.push(heatmapGrid[key] || 0);
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

  return (
    <>
      <PageHeader title="Risk Yönetimi" subtitle="ISO/IEC 17020 Madde 8 — Risk ve fırsatların belirlenmesi"
        actions={<>
          <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreate(true)}>Risk Ekle</Button>
        </>} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Toplam" value={stats.total || 0} icon={<Shield className="w-5 h-5 text-slate-600" />} color="bg-slate-50 dark:bg-slate-800" />
        <StatCard label="Açık" value={stats.open || 0} icon={<AlertTriangle className="w-5 h-5 text-red-600" />} color="bg-red-50 dark:bg-red-950/40" />
        <StatCard label="Yüksek Risk (≥15)" value={stats.high || 0} icon={<AlertTriangle className="w-5 h-5 text-amber-600" />} color="bg-amber-50 dark:bg-amber-950/40" />
      </div>

      {/* Heatmap */}
      <Card className="mb-6">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Risk Matrisi (5×5)</h3>
        {renderHeatmap()}
      </Card>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        <div className="ml-auto">
          <Select
            options={[{ value: '', label: 'Tüm Kategoriler' }, ...Object.entries(CATEGORIES).map(([v, l]) => ({ value: v, label: l }))]}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-44"
          />
        </div>
      </div>

      <Card padding="none">
        {isLoading ? <SkeletonTable rows={5} cols={8} /> : items.length === 0 ? (
          <EmptyState icon={<Shield className="w-12 h-12" />} title="Risk kaydı yok"
            action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreate(true)}>Ekle</Button>} />
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
              {items.map((r: any) => {
                const score = (r.likelihood || 0) * (r.impact || 0);
                return (
                  <tr key={r.id}>
                    <td><span className="font-mono text-xs font-semibold">{r.riskNumber}</span></td>
                    <td><Badge color="bg-slate-100 text-slate-600">{CATEGORIES[r.category] || r.category}</Badge></td>
                    <td><p className="text-sm font-medium text-slate-700 dark:text-slate-300 max-w-xs line-clamp-2">{r.title}</p></td>
                    <td><span className="text-sm font-semibold">{r.likelihood}/5</span></td>
                    <td><span className="text-sm font-semibold">{r.impact}/5</span></td>
                    <td><Badge color={scoreColor(score)}>{score}</Badge></td>
                    <td><span className="text-xs text-slate-500">{r.treatment || '—'}</span></td>
                    <td><Badge color={STATUS_COLORS[r.status] || ''} dot>{STATUS_LABELS[r.status] || r.status}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={showCreate} onClose={() => { setCreate(false); reset(); }} title="Yeni Risk" size="lg"
        footer={<>
          <Button variant="secondary" onClick={() => setCreate(false)}>İptal</Button>
          <Button loading={createMutation.isPending}
            onClick={handleSubmit((d) => createMutation.mutate({ ...d, likelihood: Number(d.likelihood), impact: Number(d.impact) }))}>
            Kaydet
          </Button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Kategori" required options={Object.entries(CATEGORIES).map(([v, l]) => ({ value: v, label: l }))} {...register('category', { required: true })} />
          <Input label="Başlık" required {...register('title', { required: true })} />
          <Textarea label="Açıklama" required {...register('description', { required: true })} className="col-span-2" rows={2} />
          <Select label="Olasılık (1-5)" options={[1, 2, 3, 4, 5].map(v => ({ value: String(v), label: `${v}` }))} {...register('likelihood')} />
          <Select label="Etki (1-5)" options={[1, 2, 3, 4, 5].map(v => ({ value: String(v), label: `${v}` }))} {...register('impact')} />
          <Select label="Tedavi" options={[{ value: 'mitigate', label: 'Azalt' }, { value: 'accept', label: 'Kabul' }, { value: 'transfer', label: 'Transfer' }, { value: 'avoid', label: 'Kaçın' }]} {...register('treatment')} />
          <Input label="Hedef Tarih" type="date" {...register('targetDate')} />
          <Textarea label="Azaltma Planı" {...register('mitigationPlan')} className="col-span-2" rows={2} />
        </div>
      </Modal>
    </>
  );
}
