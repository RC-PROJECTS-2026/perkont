'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { PageHeader, Card, CardHeader, CardTitle, Button, Select, StatCard } from '@/components/ui';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Download, RefreshCw, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';

const COLORS = ['#3366f5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const METRICS = [
  { key: 'inspections_by_period',         label: 'Denetim Trendi' },
  { key: 'inspections_by_result',         label: 'Sonuç Dağılımı' },
  { key: 'inspections_by_inspector',      label: 'Personel Performansı' },
  { key: 'equipment_control_compliance',  label: 'Kontrol Uyumu' },
  { key: 'report_delivery_time',          label: 'Rapor Teslim Süresi' },
  { key: 'work_order_completion_rate',    label: 'İş Emri Tamamlanma' },
  { key: 'nonconformity_analysis',        label: 'Uygunsuzluk Analizi' },
  { key: 'logo_sync_success_rate',        label: 'LOGO Sync Başarı' },
];

export default function AnalyticsPage() {
  const [period, setPeriod]           = useState<'month' | 'quarter' | 'year'>('month');
  const [activeMetric, setActiveMetric] = useState('inspections_by_period');
  const [dateRange, setDateRange]     = useState({
    startDate: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
    endDate:   new Date().toISOString().split('T')[0],
  });

  const { data: kpiData, isLoading: kpiLoading, refetch: refetchKpi } = useQuery({
    queryKey: ['kpi', period],
    queryFn: () => apiClient.get(`/reporting/kpi?period=${period}`),
  });

  const { data: metricData, isLoading: metricLoading } = useQuery({
    queryKey: ['metric', activeMetric, dateRange],
    queryFn: () => apiClient.get(`/reporting/metrics?metric=${activeMetric}&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`),
  });

  const kpi    = (kpiData as any)?.data;
  const metric = (metricData as any)?.data || [];

  const exportCsv = async () => {
    try {
      const res = await apiClient.get(
        `/reporting/export/csv?metric=${activeMetric}&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(res.data as any);
      const a = document.createElement('a');
      a.href = url; a.download = `${activeMetric}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Export başarısız'); }
  };

  return (
    <>
      <PageHeader
        title="Raporlama ve Analitik"
        subtitle="KPI izleme, trend analizi ve veri export"
        actions={
          <div className="flex items-center gap-3">
            <Select
              options={[
                { value: 'month',   label: 'Bu Ay' },
                { value: 'quarter', label: 'Bu Çeyrek' },
                { value: 'year',    label: 'Bu Yıl' },
              ]}
              value={period}
              onChange={(e) => setPeriod(e.target.value as any)}
              className="w-36"
            />
            <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetchKpi()}>Yenile</Button>
            <Button variant="outline" icon={<Download className="w-4 h-4" />} onClick={exportCsv}>CSV Export</Button>
          </div>
        }
      />

      {/* KPI Cards */}
      {kpiLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 skeleton rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Ort. Rapor Teslim Süresi"
            value={kpi?.reportDelivery?.avg_days ? `${kpi.reportDelivery.avg_days} gün` : '—'}
            icon={<TrendingUp className="w-5 h-5 text-teal-600" />}
            color="bg-teal-50 dark:bg-teal-950/40"
          />
          <StatCard
            label="Ekipman Kontrol Uyumu"
            value={kpi?.equipmentCompliance?.compliance_rate ? `%${kpi.equipmentCompliance.compliance_rate}` : '—'}
            icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
            color="bg-emerald-50 dark:bg-emerald-950/40"
          />
          <StatCard
            label="Gecikmiş Kontrol"
            value={kpi?.equipmentCompliance?.overdue || 0}
            icon={<TrendingUp className="w-5 h-5 text-red-600" />}
            color="bg-red-50 dark:bg-red-950/40"
          />
          <StatCard
            label="SLA Uyumluluk"
            value={kpi?.slaCompliance?.[0]?.rate ? `%${kpi.slaCompliance[0].rate}` : '—'}
            icon={<TrendingUp className="w-5 h-5 text-amber-600" />}
            color="bg-amber-50 dark:bg-amber-950/40"
          />
        </div>
      )}

      {/* Metric Selector + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Metric list */}
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Metrikler</CardTitle></CardHeader>
          <div className="space-y-1">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setActiveMetric(m.key)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  activeMetric === m.key
                    ? 'bg-teal-600 text-white font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </Card>

        {/* Chart */}
        <Card className="lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <CardTitle>{METRICS.find(m => m.key === activeMetric)?.label}</CardTitle>
            <div className="flex items-center gap-2">
              <input type="date" value={dateRange.startDate} onChange={(e) => setDateRange(p => ({ ...p, startDate: e.target.value }))}
                className="text-xs px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400" />
              <span className="text-xs text-slate-400">—</span>
              <input type="date" value={dateRange.endDate} onChange={(e) => setDateRange(p => ({ ...p, endDate: e.target.value }))}
                className="text-xs px-2 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400" />
            </div>
          </div>

          {metricLoading ? (
            <div className="h-64 skeleton rounded-xl" />
          ) : metric.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
              Bu dönem için veri bulunamadı
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                {activeMetric === 'inspections_by_result' || activeMetric === 'nonconformity_analysis' ? (
                  <PieChart>
                    <Pie data={metric} dataKey="count" nameKey={activeMetric === 'inspections_by_result' ? 'overall_result' : 'severity'}
                      cx="50%" cy="50%" outerRadius={100} label={({ name, pct }) => `${name} (${pct}%)`}>
                      {metric.map((_: any, idx: number) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                ) : activeMetric === 'inspections_by_period' || activeMetric === 'work_order_completion_rate' ? (
                  <LineChart data={metric}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="total" stroke="#3366f5" strokeWidth={2} name="Toplam" />
                    {activeMetric === 'inspections_by_period' && (
                      <>
                        <Line type="monotone" dataKey="compliant" stroke="#10b981" strokeWidth={2} name="Uygun" />
                        <Line type="monotone" dataKey="non_compliant" stroke="#ef4444" strokeWidth={2} name="Uygunsuz" />
                      </>
                    )}
                  </LineChart>
                ) : (
                  <BarChart data={metric}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey={Object.keys(metric[0] || {})[0]} tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    {Object.keys(metric[0] || {}).slice(1).map((key, idx) => (
                      <Bar key={key} dataKey={key} fill={COLORS[idx % COLORS.length]} name={key} />
                    ))}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
