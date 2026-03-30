'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Download, TrendingUp, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { reportingApi } from '@/lib/api';
import { PageHeader, Card, StatCard, Badge, Button, Select, Tabs } from '@/components/ui';
import { formatDate } from '@/lib/utils';

const metrics = [
  { key: 'inspections_by_period', label: 'Dönemsel Denetimler' },
  { key: 'inspections_by_result', label: 'Sonuca Göre Denetimler' },
  { key: 'inspections_by_inspector', label: 'Muayene Elemanına Göre' },
  { key: 'equipment_control_compliance', label: 'Ekipman Kontrol Uyumu' },
  { key: 'report_delivery_time', label: 'Rapor Teslim Süresi' },
  { key: 'work_order_completion_rate', label: 'İş Emri Tamamlanma Oranı' },
  { key: 'customer_activity', label: 'Müşteri Aktivitesi' },
  { key: 'nonconformity_analysis', label: 'Uygunsuzluk Analizi' },
  { key: 'logo_sync_success_rate', label: 'LOGO Senkron Başarı Oranı' },
  { key: 'sla_compliance', label: 'SLA Uyumu' },
];

export default function AnalyticsPage() {
  const [selectedMetric, setSelectedMetric] = useState('inspections_by_period');

  const { data: kpi, isLoading: kpiLoading } = useQuery({
    queryKey: ['reporting-kpi'],
    queryFn: reportingApi.getKpi,
  });

  const { data: metricData, isLoading: metricLoading } = useQuery({
    queryKey: ['reporting-metric', selectedMetric],
    queryFn: () => reportingApi.getMetric(selectedMetric),
  });

  const handleExport = async () => {
    try {
      const blob = await reportingApi.exportCsv(selectedMetric);
      const url = window.URL.createObjectURL(blob as any);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedMetric}_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
    } catch {
      // ignore
    }
  };

  const kpiData = (kpi as any)?.data || kpi || {};

  return (
    <div>
      <PageHeader title="İstatistikler ve BI Raporlama" subtitle="Performans metrikleri ve analitik raporlar" />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Toplam Denetim"
          value={kpiData.totalInspections || '—'}
          icon={<CheckCircle className="w-5 h-5 text-green-500" />}
        />
        <StatCard
          title="Uyumluluk Oranı"
          value={kpiData.complianceRate ? `%${kpiData.complianceRate}` : '—'}
          icon={<TrendingUp className="w-5 h-5 text-blue-500" />}
        />
        <StatCard
          title="Ort. Rapor Teslim (Gün)"
          value={kpiData.avgDeliveryDays || '—'}
          icon={<Clock className="w-5 h-5 text-amber-500" />}
        />
        <StatCard
          title="Uygunsuzluk"
          value={kpiData.nonconformityCount || '—'}
          icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
        />
      </div>

      {/* Metric Selector */}
      <Card className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-teal-600" />
            <h3 className="font-bold text-slate-900 dark:text-slate-100">Metrik Seçin</h3>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm px-3 py-2"
            >
              {metrics.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
            <Button variant="outline" size="sm" icon={<Download className="w-4 h-4" />} onClick={handleExport}>
              CSV İndir
            </Button>
          </div>
        </div>
      </Card>

      {/* Metric Results */}
      <Card>
        <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-4">
          {metrics.find((m) => m.key === selectedMetric)?.label}
        </h3>
        {metricLoading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-8 bg-slate-100 dark:bg-slate-800 rounded" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            {Array.isArray((metricData as any)?.data || metricData) ? (
              <table className="data-table">
                <thead>
                  <tr>
                    {Object.keys(((metricData as any)?.data || metricData)?.[0] || {}).map((key) => (
                      <th key={key}>{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {((metricData as any)?.data || metricData || []).map((row: any, i: number) => (
                    <tr key={i}>
                      {Object.values(row).map((val: any, j: number) => (
                        <td key={j}>{typeof val === 'number' ? val.toLocaleString('tr-TR') : String(val ?? '—')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-slate-500 text-sm">Henüz veri bulunmuyor.</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
