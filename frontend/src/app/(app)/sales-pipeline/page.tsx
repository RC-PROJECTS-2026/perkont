'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { salesPipelineApi, customersApi } from '@/lib/api';
import {
  PageHeader, Card, CardHeader, CardTitle, Badge, Button, SearchInput,
  SkeletonTable, EmptyState, Tabs, Modal, Input, Select, Textarea, StatCard,
} from '@/components/ui';
import { formatDate, formatCurrency } from '@/lib/utils';
import {
  TrendingUp, Plus, RefreshCw, Phone, Mail, MapPin, Calendar,
  DollarSign, Target, Clock, CheckCircle2, XCircle, Eye,
  MessageSquare, ChevronDown, ChevronUp, Award, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';

const stageLabels: Record<string, string> = {
  new: 'Yeni',
  contacted: 'İletişim Kuruldu',
  proposal_sent: 'Teklif Gönderildi',
  negotiation: 'Müzakere',
  won: 'Kazanıldı',
  lost: 'Kaybedildi',
};
const stageColors: Record<string, string> = {
  new: 'bg-blue-900/30 text-blue-400',
  contacted: 'bg-purple-900/30 text-purple-400',
  proposal_sent: 'bg-amber-900/30 text-amber-400',
  negotiation: 'bg-orange-900/30 text-orange-400',
  won: 'bg-green-900/30 text-green-400',
  lost: 'bg-red-900/30 text-red-400',
};
const sourceLabels: Record<string, string> = {
  referral: 'Referans',
  website: 'Web Sitesi',
  cold_call: 'Soğuk Arama',
  exhibition: 'Fuar',
  repeat: 'Mevcut Müşteri',
  other: 'Diğer',
};

export default function SalesPipelinePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showActivityModal, setShowActivityModal] = useState<string | null>(null);
  const [showLostModal, setShowLostModal] = useState<string | null>(null);
  const [activityNote, setActivityNote] = useState('');
  const [activityType, setActivityType] = useState('call');
  const [lostReason, setLostReason] = useState('');

  // Form state
  const [custSearch, setCustSearch] = useState('');
  const [form, setForm] = useState({
    customerId: '', title: '', source: 'referral', estimatedValue: 0,
    probability: 50, expectedCloseDate: '', notes: '',
  });

  // Queries
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['sales-pipeline', tab, search],
    queryFn: () => salesPipelineApi.list({
      stage: tab === 'all' ? undefined : tab,
      search: search || undefined,
      limit: 100,
    }),
  });
  const opportunities = (data as any)?.data?.data || (data as any)?.data || [];

  const { data: statsData } = useQuery({
    queryKey: ['sales-pipeline-stats'],
    queryFn: () => salesPipelineApi.getStats(),
  });
  const stats = (statsData as any)?.data || {};

  const { data: followUpsData } = useQuery({
    queryKey: ['sales-pipeline-follow-ups'],
    queryFn: () => salesPipelineApi.getFollowUps(),
  });
  const followUps = (followUpsData as any)?.data || [];

  const { data: customersData } = useQuery({
    queryKey: ['customers-select', custSearch],
    queryFn: () => customersApi.list({ search: custSearch || undefined, limit: 50 }),
    enabled: showCreate,
  });
  const rawCust = (customersData as any)?.data;
  const customers = Array.isArray(rawCust) ? rawCust : (rawCust?.data || []);

  // Mutations
  const createMut = useMutation({
    mutationFn: (data: any) => salesPipelineApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-pipeline'] });
      qc.invalidateQueries({ queryKey: ['sales-pipeline-stats'] });
      setShowCreate(false);
      resetForm();
      toast.success('Satış fırsatı oluşturuldu');
    },
    onError: (e: any) => toast.error(e.message || 'Hata oluştu'),
  });

  const wonMut = useMutation({
    mutationFn: (id: string) => salesPipelineApi.markWon(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-pipeline'] });
      qc.invalidateQueries({ queryKey: ['sales-pipeline-stats'] });
      toast.success('Fırsat kazanıldı olarak işaretlendi');
    },
    onError: (e: any) => toast.error(e.message || 'Hata oluştu'),
  });

  const lostMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => salesPipelineApi.markLost(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-pipeline'] });
      qc.invalidateQueries({ queryKey: ['sales-pipeline-stats'] });
      setShowLostModal(null);
      setLostReason('');
      toast.success('Fırsat kaybedildi olarak işaretlendi');
    },
    onError: (e: any) => toast.error(e.message || 'Hata oluştu'),
  });

  const addActivityMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => salesPipelineApi.addActivity(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-pipeline'] });
      setShowActivityModal(null);
      setActivityNote('');
      toast.success('Görüşme notu eklendi');
    },
    onError: (e: any) => toast.error(e.message || 'Hata oluştu'),
  });

  const resetForm = () => {
    setForm({ customerId: '', title: '', source: 'referral', estimatedValue: 0, probability: 50, expectedCloseDate: '', notes: '' });
    setCustSearch('');
  };

  const tabs = [
    { key: 'all', label: 'Tümü' },
    { key: 'new', label: 'Yeni' },
    { key: 'contacted', label: 'İletişim Kuruldu' },
    { key: 'proposal_sent', label: 'Teklif Gönderildi' },
    { key: 'negotiation', label: 'Müzakere' },
    { key: 'won', label: 'Kazanıldı' },
    { key: 'lost', label: 'Kaybedildi' },
  ];

  const pipelineTotal = stats.pipelineTotal || 0;
  const openCount = stats.openCount || 0;
  const winRate = stats.winRate || 0;
  const upcomingFollowUps = stats.upcomingFollowUps || followUps.length || 0;

  return (
    <>
      <PageHeader
        title="Satış Fırsatları"
        subtitle="Satış pipeline yönetimi ve fırsat takibi"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Yeni Fırsat</Button>
          </div>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Pipeline Toplamı"
          value={formatCurrency(pipelineTotal)}
          icon={<DollarSign className="w-5 h-5 text-teal-400" />}
        />
        <StatCard
          title="Açık Fırsat"
          value={openCount}
          icon={<Target className="w-5 h-5 text-blue-400" />}
        />
        <StatCard
          title="Kazanılma Oranı"
          value={`%${winRate}`}
          icon={<Award className="w-5 h-5 text-green-400" />}
        />
        <StatCard
          title="Yaklaşan Takipler"
          value={upcomingFollowUps}
          icon={<Clock className="w-5 h-5 text-amber-400" />}
        />
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        <SearchInput value={search} onChange={setSearch} placeholder="Fırsat veya müşteri ara..." className="w-64" />
      </div>

      {/* Table */}
      {isLoading ? (
        <SkeletonTable rows={8} cols={9} />
      ) : opportunities.length === 0 ? (
        <EmptyState
          title="Fırsat bulunamadı"
          description="Yeni bir satış fırsatı oluşturarak başlayın."
          action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Yeni Fırsat</Button>}
        />
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Başlık</th>
                  <th>Müşteri</th>
                  <th>Tahmini Değer</th>
                  <th>Olasılık %</th>
                  <th>Kaynak</th>
                  <th>Son İletişim</th>
                  <th>Sonraki Takip</th>
                  <th>Durum</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((opp: any) => {
                  const isExpanded = expandedId === opp.id;
                  return (
                    <tr key={opp.id}>
                      <td>
                        <button
                          className="text-left w-full group"
                          onClick={() => setExpandedId(isExpanded ? null : opp.id)}
                        >
                          <span className="text-sm font-semibold text-slate-200 group-hover:text-teal-400 transition-colors">
                            {opp.title}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-3 h-3 inline ml-1 text-slate-500" />
                          ) : (
                            <ChevronDown className="w-3 h-3 inline ml-1 text-slate-500" />
                          )}
                          {isExpanded && (
                            <div className="mt-2 p-3 bg-slate-800/50 rounded-lg text-xs text-slate-400 space-y-1" onClick={(e) => e.stopPropagation()}>
                              {opp.notes && <p>{opp.notes}</p>}
                              {opp.expectedCloseDate && <p>Beklenen Kapanış: {formatDate(opp.expectedCloseDate)}</p>}
                              <p>Oluşturulma: {formatDate(opp.createdAt)}</p>
                            </div>
                          )}
                        </button>
                      </td>
                      <td><span className="text-sm text-slate-300">{opp.customer?.name || '—'}</span></td>
                      <td><span className="text-sm font-semibold text-slate-200">{formatCurrency(opp.estimatedValue || 0)}</span></td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-teal-500"
                              style={{ width: `${opp.probability || 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-400">%{opp.probability || 0}</span>
                        </div>
                      </td>
                      <td><span className="text-xs text-slate-400">{sourceLabels[opp.source] || opp.source || '—'}</span></td>
                      <td><span className="text-xs text-slate-400">{opp.lastContactDate ? formatDate(opp.lastContactDate) : '—'}</span></td>
                      <td>
                        {opp.nextFollowUp ? (
                          <span className={`text-xs ${new Date(opp.nextFollowUp) < new Date() ? 'text-red-400 font-semibold' : 'text-slate-400'}`}>
                            {formatDate(opp.nextFollowUp)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                      <td>
                        <Badge color={stageColors[opp.stage] || 'bg-slate-800 text-slate-400'}>
                          {stageLabels[opp.stage] || opp.stage}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button
                            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-teal-400 transition-colors"
                            title="Görüşme notu ekle"
                            onClick={(e) => { e.stopPropagation(); setShowActivityModal(opp.id); }}
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                          {opp.stage !== 'won' && opp.stage !== 'lost' && (
                            <>
                              <button
                                className="p-1.5 rounded-lg hover:bg-green-900/30 text-slate-400 hover:text-green-400 transition-colors"
                                title="Kazandı"
                                onClick={(e) => { e.stopPropagation(); wonMut.mutate(opp.id); }}
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                              <button
                                className="p-1.5 rounded-lg hover:bg-red-900/30 text-slate-400 hover:text-red-400 transition-colors"
                                title="Kaybetti"
                                onClick={(e) => { e.stopPropagation(); setShowLostModal(opp.id); }}
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Yaklaşan Takipler */}
      {followUps.length > 0 && (
        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                Yaklaşan Takipler
              </CardTitle>
            </CardHeader>
            <div className="space-y-2">
              {followUps.map((fu: any) => {
                const isOverdue = fu.nextFollowUp && new Date(fu.nextFollowUp) < new Date();
                return (
                  <div
                    key={fu.id}
                    className="flex items-center justify-between p-3 bg-slate-800/40 rounded-lg hover:bg-slate-800/60 transition-colors cursor-pointer"
                    onClick={() => setExpandedId(expandedId === fu.id ? null : fu.id)}
                  >
                    <div className="flex items-center gap-3">
                      {isOverdue ? (
                        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      ) : (
                        <Calendar className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-semibold text-slate-200">{fu.title}</p>
                        <p className="text-xs text-slate-500">{fu.customer?.name || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium ${isOverdue ? 'text-red-400' : 'text-amber-400'}`}>
                        {fu.nextFollowUp ? formatDate(fu.nextFollowUp) : '—'}
                      </span>
                      <Badge color={stageColors[fu.stage] || 'bg-slate-800 text-slate-400'}>
                        {stageLabels[fu.stage] || fu.stage}
                      </Badge>
                      <button
                        className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-teal-400"
                        onClick={(e) => { e.stopPropagation(); setShowActivityModal(fu.id); }}
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Yeni Fırsat Modalı */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); resetForm(); }} title="Yeni Satış Fırsatı" size="lg">
        <div className="space-y-4">
          {/* Müşteri Arama */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Müşteri</label>
            <div className="relative">
              <input
                type="text"
                list="customer-list"
                value={custSearch}
                onChange={(e) => {
                  setCustSearch(e.target.value);
                  const match = customers.find((c: any) => c.name === e.target.value);
                  if (match) setForm({ ...form, customerId: match.id });
                }}
                placeholder="Müşteri adı yazarak arayın..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
              <datalist id="customer-list">
                {customers.map((c: any) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>
          </div>

          <Input
            label="Fırsat Başlığı"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Yıllık periyodik kontrol anlaşması"
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Kaynak"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              options={Object.entries(sourceLabels).map(([k, v]) => ({ value: k, label: v }))}
            />
            <Input
              label="Tahmini Değer (₺)"
              type="number"
              value={form.estimatedValue}
              onChange={(e) => setForm({ ...form, estimatedValue: +e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Olasılık (%{form.probability})</label>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={form.probability}
                onChange={(e) => setForm({ ...form, probability: +e.target.value })}
                className="w-full accent-teal-500"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>%0</span><span>%50</span><span>%100</span>
              </div>
            </div>
            <Input
              label="Beklenen Kapanış Tarihi"
              type="date"
              value={form.expectedCloseDate}
              onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })}
            />
          </div>

          <Textarea
            label="Notlar"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Fırsat hakkında detaylar..."
          />

          <Button
            className="w-full"
            loading={createMut.isPending}
            onClick={() => {
              if (!form.customerId) { toast.error('Müşteri seçiniz'); return; }
              if (!form.title.trim()) { toast.error('Başlık giriniz'); return; }
              createMut.mutate(form);
            }}
          >
            Fırsat Oluştur
          </Button>
        </div>
      </Modal>

      {/* Görüşme Notu Modalı */}
      <Modal
        open={!!showActivityModal}
        onClose={() => { setShowActivityModal(null); setActivityNote(''); }}
        title="Görüşme Notu Ekle"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-300 mb-2">Aktivite Tipi</p>
            <div className="flex gap-2">
              {[
                { key: 'call', label: 'Telefon', icon: <Phone className="w-4 h-4" /> },
                { key: 'email', label: 'E-posta', icon: <Mail className="w-4 h-4" /> },
                { key: 'visit', label: 'Ziyaret', icon: <MapPin className="w-4 h-4" /> },
                { key: 'note', label: 'Not', icon: <MessageSquare className="w-4 h-4" /> },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActivityType(t.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                    activityType === t.key
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-transparent text-slate-400 border-slate-600 hover:border-teal-500'
                  }`}
                >
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
          </div>
          <Textarea
            label="Not"
            value={activityNote}
            onChange={(e) => setActivityNote(e.target.value)}
            placeholder="Görüşme detaylarını yazın..."
            className="min-h-[120px]"
          />
          <Button
            className="w-full"
            loading={addActivityMut.isPending}
            onClick={() => {
              if (!activityNote.trim()) { toast.error('Not giriniz'); return; }
              addActivityMut.mutate({
                id: showActivityModal!,
                data: { type: activityType, note: activityNote },
              });
            }}
          >
            Notu Kaydet
          </Button>
        </div>
      </Modal>

      {/* Kaybedildi Modalı */}
      <Modal
        open={!!showLostModal}
        onClose={() => { setShowLostModal(null); setLostReason(''); }}
        title="Fırsatı Kaybedildi Olarak İşaretle"
        size="md"
      >
        <div className="space-y-4">
          <Textarea
            label="Kayıp Sebebi"
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            placeholder="Neden kaybedildi? (fiyat, rekabet, zamanlama vb.)"
            className="min-h-[100px]"
          />
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => { setShowLostModal(null); setLostReason(''); }}
            >
              İptal
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700"
              loading={lostMut.isPending}
              onClick={() => {
                if (!lostReason.trim()) { toast.error('Sebep giriniz'); return; }
                lostMut.mutate({ id: showLostModal!, reason: lostReason });
              }}
            >
              Kaybedildi Olarak İşaretle
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
