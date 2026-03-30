'use client';
/**
 * Müşteri Portali — /portal rotaları
 * Müşteriler kendi ekipmanlarını, raporlarını ve yaklaşan kontrolleri görür.
 * JWT'deki role === 'customer' ise bu sayfalara yönlendirilir.
 */
import { useAuthStore } from '@/store/auth.store';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { Card, CardHeader, CardTitle, Badge, Button, StatCard, EmptyState } from '@/components/ui';
import { formatDate, REPORT_STATUS_LABELS } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import {
  Package, FileText, Calendar, AlertTriangle,
  Download, CheckCircle2, Clock, Eye,
} from 'lucide-react';
import { reportsApi } from '@/lib/api';
import toast from 'react-hot-toast';

const portalApi = {
  getMyEquipment:  () => apiClient.get('/portal/equipment'),
  getMyReports:    () => apiClient.get('/portal/reports'),
  getMyContracts:  () => apiClient.get('/portal/contracts'),
  getMyDashboard:  () => apiClient.get('/portal/dashboard'),
};

export default function CustomerPortalDashboard() {
  const { user } = useAuthStore();
  const router   = useRouter();

  const { data: dashData } = useQuery({
    queryKey: ['portal-dashboard'],
    queryFn: portalApi.getMyDashboard,
  });
  const { data: eqData } = useQuery({
    queryKey: ['portal-equipment'],
    queryFn: portalApi.getMyEquipment,
  });
  const { data: rpData } = useQuery({
    queryKey: ['portal-reports'],
    queryFn: portalApi.getMyReports,
  });

  const dash     = (dashData as any)?.data || {};
  const equipment = (eqData as any)?.data || [];
  const reports   = (rpData as any)?.data || [];

  const downloadReport = async (reportId: string, reportNumber: string) => {
    try {
      const blob = await reportsApi.getPdf(reportId, true);
      const url = URL.createObjectURL(blob as any);
      const a = document.createElement('a');
      a.href = url; a.download = `${reportNumber}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Rapor indirilemedi'); }
  };

  const overdueEquipment = equipment.filter((e: any) =>
    e.nextControlDate && new Date(e.nextControlDate) < new Date(),
  );
  const upcomingEquipment = equipment.filter((e: any) => {
    if (!e.nextControlDate) return false;
    const d = new Date(e.nextControlDate);
    const now = new Date();
    const days = Math.ceil((d.getTime() - now.getTime()) / 86400000);
    return days >= 0 && days <= 30;
  });

  return (
    <>
      {/* Portal header */}
      <div className="mb-8">
        <h1 className="font-display font-extrabold text-3xl text-slate-900 dark:text-slate-100 tracking-tight">
          Hoş Geldiniz 👋
        </h1>
        <p className="text-slate-500 mt-1">
          {user?.fullName} — Ekipman Kontrol Portalı
        </p>
      </div>

      {/* Alert: Geciken kontroller */}
      {overdueEquipment.length > 0 && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              {overdueEquipment.length} ekipmanın periyodik kontrol tarihi geçmiş!
            </p>
            <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">
              Lütfen en kısa sürede yetkili firma ile iletişime geçiniz.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Toplam Ekipman" value={equipment.length}
          icon={<Package className="w-5 h-5 text-teal-600" />} color="bg-teal-50 dark:bg-teal-950/40" />
        <StatCard label="Hazır Raporlar" value={reports.filter((r: any) => r.status === 'delivered' || r.status === 'signed').length}
          icon={<FileText className="w-5 h-5 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-950/40" />
        <StatCard label="Yaklaşan Kontrol" value={upcomingEquipment.length}
          icon={<Calendar className="w-5 h-5 text-amber-600" />} color="bg-amber-50 dark:bg-amber-950/40" />
        <StatCard label="Gecikmiş Kontrol" value={overdueEquipment.length}
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />} color="bg-red-50 dark:bg-red-950/40" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Son raporlar */}
        <Card padding="none">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800">
            <CardHeader>
              <CardTitle>Son Raporlar</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => router.push('/portal/reports')}>
                Tümünü Gör →
              </Button>
            </CardHeader>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {reports.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">Henüz rapor yok</div>
            ) : (
              reports.slice(0, 5).map((r: any) => {
                const s = REPORT_STATUS_LABELS[r.status] || { label: r.status, color: '' };
                const isDownloadable = r.status === 'signed' || r.status === 'delivered';
                return (
                  <div key={r.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-950/40 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-teal-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 font-mono">{r.reportNumber}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{formatDate(r.createdAt)}</p>
                    </div>
                    <Badge color={s.color}>{s.label}</Badge>
                    {isDownloadable && (
                      <button
                        onClick={() => downloadReport(r.id, r.reportNumber)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-teal-600"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* Yaklaşan kontroller */}
        <Card padding="none">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800">
            <CardHeader>
              <CardTitle>Yaklaşan Periyodik Kontroller</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => router.push('/portal/equipment')}>
                Tüm Ekipmanlar →
              </Button>
            </CardHeader>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {upcomingEquipment.length === 0 && overdueEquipment.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">
                <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
                Önümüzdeki 30 günde periyodik kontrol yok
              </div>
            ) : (
              [...overdueEquipment, ...upcomingEquipment].slice(0, 8).map((eq: any) => {
                const d = new Date(eq.nextControlDate);
                const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
                const isOv = days < 0;
                return (
                  <div key={eq.id} className="flex items-center gap-4 px-5 py-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isOv ? 'bg-red-500' : days <= 7 ? 'bg-amber-500' : 'bg-green-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate font-mono">
                        {eq.inventoryCode}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{eq.equipmentType?.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-slate-500">{formatDate(eq.nextControlDate)}</p>
                      <p className={`text-xs font-semibold ${isOv ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-slate-400'}`}>
                        {isOv ? `${Math.abs(days)}g gecikmiş` : `${days}g kaldı`}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
