'use client';
import { useState } from 'react';
import { useMainDashboard, useEquipment, useReports, dashboardApi, salesPipelineApi, proposalsApi, workOrdersApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { StatCard, Card, CardHeader, CardTitle, Badge, PageHeader, Skeleton, SkeletonTable, Button } from '@/components/ui';
import { formatDate, formatCurrency, REPORT_STATUS_LABELS, WORK_ORDER_STATUS_LABELS } from '@/lib/utils';
import {
  ClipboardList, FileText, AlertTriangle, Clock, Package,
  CreditCard, TrendingUp, CheckCircle2, XCircle, Activity,
  ShieldAlert, BarChart3, CalendarClock, Briefcase, Users, Wrench,
  DollarSign, Target, PhoneCall, Send, Eye, ChevronDown, ChevronUp,
  Plus, ListChecks, Receipt, Zap,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import Link from 'next/link';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-glass text-xs">
        <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</p>
        ))}
      </div>
    );
  }
  return null;
};

/* ─── Upcoming Controls (shared widget) ─── */
function UpcomingControlsWidget({ upcoming }: { upcoming: any[] }) {
  return (
    <Card padding="none">
      <div className="p-5 pb-3 border-b border-slate-100 dark:border-slate-800">
        <CardHeader>
          <CardTitle>Yaklaşan Kontroller</CardTitle>
          <Link href="/equipment/schedule" className="text-xs text-teal-600 hover:text-teal-700">Tümü →</Link>
        </CardHeader>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
        {upcoming.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">Yaklaşan kontrol yok</div>
        ) : (
          upcoming.slice(0, 8).map((eq: any) => {
            const daysLeft = Math.ceil(
              (new Date(eq.nextControlDate).getTime() - Date.now()) / 86400000,
            );
            const isUrgent = daysLeft <= 7;
            const isWarning = daysLeft <= 14;
            return (
              <div key={eq.id} className="flex items-center gap-3 px-5 py-3">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isUrgent ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {eq.inventoryCode}
                  </p>
                  <p className="text-xs text-slate-400 truncate">{eq.customer?.name}</p>
                </div>
                <span className={`text-xs font-semibold ${isUrgent ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-slate-500'}`}>
                  {daysLeft}g
                </span>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

/* ─── SALES Dashboard ─── */
function SalesDashboard({ dash, isLoading, upcoming }: { dash: any; isLoading: boolean; upcoming: any[] }) {
  const { data: followUpsData, isLoading: fuLoading } = useQuery({
    queryKey: ['sales-follow-ups'],
    queryFn: () => salesPipelineApi.getFollowUps(),
  });
  const { data: recentProposals, isLoading: rpLoading } = useQuery({
    queryKey: ['recent-proposals'],
    queryFn: () => proposalsApi.list({ limit: 5 }),
  });

  const followUps = (followUpsData as any)?.data?.data || (followUpsData as any)?.data || [];
  const proposals = (recentProposals as any)?.data?.data || (recentProposals as any)?.data || [];

  return (
    <>
      {/* Sales Action Items */}
      {Array.isArray(followUps) && followUps.length > 0 && (
        <div className="mb-4 p-4 bg-amber-900/20 border border-amber-800/40 rounded-xl">
          <p className="text-sm font-semibold text-amber-300 mb-2">Aksiyon Gerekiyor</p>
          <div className="space-y-1.5">
            {followUps.slice(0, 3).map((f: any) => (
              <div key={f.id} className="flex items-center gap-2 text-xs text-amber-200/80">
                <Clock className="w-3.5 h-3.5" />
                <span>{f.title?.substring(0, 60) || f.description?.substring(0, 60) || 'Takip zamanı geldi'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Açık Fırsatlar" value={isLoading ? '—' : (dash?.salesPerformance?.total ?? 0)} icon={<Target className="w-5 h-5 text-teal-600" />} color="bg-teal-50 dark:bg-teal-950/40" loading={isLoading} />
        <StatCard label="Bu Ay Kazanılan" value={isLoading ? '—' : (dash?.salesPerformance?.accepted ?? 0)} icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-950/40" loading={isLoading} />
        <StatCard label="Bekleyen Teklifler" value={isLoading ? '—' : (dash?.salesPerformance?.pending ?? 0)} icon={<FileText className="w-5 h-5 text-amber-600" />} color="bg-amber-50 dark:bg-amber-950/40" loading={isLoading} />
        <StatCard label="Takip Gereken" value={fuLoading ? '—' : (Array.isArray(followUps) ? followUps.length : 0)} icon={<PhoneCall className="w-5 h-5 text-violet-600" />} color="bg-violet-50 dark:bg-violet-950/40" loading={fuLoading} />
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3 mb-6">
        <Link href="/sales-pipeline?action=new"><Button icon={<Plus className="w-4 h-4" />}>Yeni Fırsat</Button></Link>
        <Link href="/proposals/new"><Button variant="outline" icon={<Send className="w-4 h-4" />}>Yeni Teklif</Button></Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Follow-ups */}
        <Card>
          <CardHeader><CardTitle>Yaklaşan Takipler</CardTitle></CardHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {fuLoading ? <Skeleton className="h-32" /> : (Array.isArray(followUps) ? followUps : []).length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">Yaklaşan takip yok</p>
            ) : (
              (Array.isArray(followUps) ? followUps : []).slice(0, 10).map((fu: any) => (
                <Link key={fu.id} href={`/sales-pipeline`} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{fu.title || fu.customerName || '—'}</p>
                    <p className="text-xs text-slate-500">{fu.followUpDate ? formatDate(fu.followUpDate) : fu.nextFollowUp ? formatDate(fu.nextFollowUp) : '—'}</p>
                  </div>
                  <Badge color="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">{fu.stage || fu.status || 'Takip'}</Badge>
                </Link>
              ))
            )}
          </div>
        </Card>

        {/* Recent Proposals */}
        <Card>
          <CardHeader><CardTitle>Son Teklifler</CardTitle></CardHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {rpLoading ? <Skeleton className="h-32" /> : (Array.isArray(proposals) ? proposals : []).length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">Teklif yok</p>
            ) : (
              (Array.isArray(proposals) ? proposals : []).slice(0, 5).map((p: any) => (
                <Link key={p.id} href={`/proposals/${p.id}`} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{p.proposalNumber || p.number || '—'}</p>
                    <p className="text-xs text-slate-500">{p.customerName || '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{formatCurrency(p.totalAmount || p.amount || 0)}</p>
                    <Badge color="bg-slate-100 dark:bg-slate-800 text-slate-500">{p.status || '—'}</Badge>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Upcoming Controls */}
      <UpcomingControlsWidget upcoming={upcoming} />
    </>
  );
}

/* ─── PLANNER Dashboard ─── */
function PlannerDashboard({ dash, isLoading }: { dash: any; isLoading: boolean }) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Bugünkü İş Emirleri" value={isLoading ? '—' : (dash?.today?.workOrders ?? 0)} icon={<ClipboardList className="w-5 h-5 text-teal-600" />} color="bg-teal-50 dark:bg-teal-950/40" loading={isLoading} />
        <StatCard label="Planlanmamış" value={isLoading ? '—' : (dash?.pending?.unplannedWorkOrders ?? 0)} icon={<AlertTriangle className="w-5 h-5 text-amber-600" />} color="bg-amber-50 dark:bg-amber-950/40" loading={isLoading} />
        <StatCard label="Bu Hafta" value={isLoading ? '—' : (dash?.thisWeek?.workOrders ?? 0)} icon={<CalendarClock className="w-5 h-5 text-indigo-600" />} color="bg-indigo-50 dark:bg-indigo-950/40" loading={isLoading} />
        <StatCard label="Geciken" value={isLoading ? '—' : (dash?.pending?.overdueWorkOrders ?? 0)} icon={<Clock className="w-5 h-5 text-red-600" />} color="bg-red-50 dark:bg-red-950/40" loading={isLoading} />
      </div>

      {/* Quick Action */}
      <div className="flex gap-3 mb-6">
        <Link href="/work-orders/new"><Button icon={<Plus className="w-4 h-4" />}>Yeni İş Emri</Button></Link>
        <Link href="/planning"><Button variant="outline" icon={<CalendarClock className="w-4 h-4" />}>Planlama Takvimi</Button></Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Summary */}
        <Card>
          <CardHeader><CardTitle>Haftalık Planlama Özeti</CardTitle></CardHeader>
          <div className="space-y-3">
            {isLoading ? <Skeleton className="h-32" /> : (
              <>
                <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-sm text-slate-500">Bugün</span>
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{dash?.today?.workOrders ?? 0} iş emri</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-sm text-slate-500">Bu Hafta Toplam</span>
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{dash?.thisWeek?.workOrders ?? 0} iş emri</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-sm text-slate-500">Atanmış Muayene Personeli</span>
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{dash?.thisWeek?.assignedInspectors ?? '—'}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-sm text-slate-500">30 Günde Kontrol</span>
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{dash?.upcoming?.equipmentControls30Days ?? 0}</span>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Unassigned Work Orders */}
        <Card>
          <CardHeader><CardTitle>Atanmamış İş Emirleri</CardTitle></CardHeader>
          <div className="space-y-2">
            {isLoading ? <Skeleton className="h-32" /> : (
              (dash?.pending?.unplannedWorkOrders ?? 0) === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">Tüm iş emirleri atanmış</p>
              ) : (
                <div className="text-center py-6">
                  <p className="text-3xl font-bold text-amber-600 mb-2">{dash?.pending?.unplannedWorkOrders ?? 0}</p>
                  <p className="text-sm text-slate-500 mb-4">iş emri atama bekliyor</p>
                  <Link href="/work-orders?status=unassigned"><Button variant="outline" size="sm">İş Emirlerini Gör</Button></Link>
                </div>
              )
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

/* ─── INSPECTOR Dashboard ─── */
function InspectorDashboard({ dash, isLoading }: { dash: any; isLoading: boolean }) {
  const { data: inspectorData, isLoading: inspLoading } = useQuery({
    queryKey: ['dashboard-inspector'],
    queryFn: () => dashboardApi.getInspector(),
  });
  const inspDash = (inspectorData as any)?.data;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard label="Bugünkü Görevlerim" value={inspLoading ? '—' : (inspDash?.today?.workOrders ?? dash?.today?.workOrders ?? 0)} icon={<ClipboardList className="w-5 h-5 text-teal-600" />} color="bg-teal-50 dark:bg-teal-950/40" loading={inspLoading && isLoading} />
        <StatCard label="Bu Hafta" value={inspLoading ? '—' : (inspDash?.thisWeek?.workOrders ?? dash?.thisWeek?.workOrders ?? 0)} icon={<CalendarClock className="w-5 h-5 text-indigo-600" />} color="bg-indigo-50 dark:bg-indigo-950/40" loading={inspLoading && isLoading} />
      </div>

      <Card>
        <CardHeader><CardTitle>Bugünkü İş Emirleri</CardTitle></CardHeader>
        <div className="space-y-2">
          {(inspLoading && isLoading) ? <Skeleton className="h-32" /> : (
            (inspDash?.todayWorkOrders || []).length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">Bugün için atanmış iş emri yok</p>
            ) : (
              (inspDash?.todayWorkOrders || []).map((wo: any) => (
                <Link key={wo.id} href={`/work-orders/${wo.id}`} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{wo.workOrderNumber || wo.number}</p>
                    <p className="text-xs text-slate-500">{wo.customerName || wo.customer?.name || '—'} {wo.plannedDate ? `- ${formatDate(wo.plannedDate)}` : ''}</p>
                  </div>
                  <Badge color={wo.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400'}>{wo.status || 'Planlandı'}</Badge>
                </Link>
              ))
            )
          )}
        </div>
      </Card>
    </>
  );
}

/* ─── TECHNICAL MANAGER Dashboard ─── */
function TechManagerDashboard({ dash, isLoading, ext, extLoading }: { dash: any; isLoading: boolean; ext: any; extLoading: boolean }) {
  return (
    <>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Onay Bekleyen" value={isLoading ? '—' : (dash?.pending?.reportApprovals ?? 0)} icon={<FileText className="w-5 h-5 text-amber-600" />} color="bg-amber-50 dark:bg-amber-950/40" loading={isLoading} />
        <StatCard label="Bu Hafta Onaylanan" value={isLoading ? '—' : (dash?.thisWeek?.approvedReports ?? 0)} icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-950/40" loading={isLoading} />
        <StatCard label="Geciken Raporlar" value={isLoading ? '—' : (dash?.pending?.overdueReports ?? 0)} icon={<Clock className="w-5 h-5 text-red-600" />} color="bg-red-50 dark:bg-red-950/40" loading={isLoading} />
      </div>

      {/* Quick Action */}
      <div className="flex gap-3 mb-6">
        <Link href="/reports/review"><Button icon={<Eye className="w-4 h-4" />}>İnceleme Kuyruğuna Git</Button></Link>
      </div>

      <Card>
        <CardHeader><CardTitle>Onay Bekleyen Raporlar</CardTitle></CardHeader>
        <div className="space-y-2">
          {isLoading ? <Skeleton className="h-32" /> : (
            (dash?.pending?.reportApprovals ?? 0) === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">Onay bekleyen rapor yok</p>
            ) : (
              <div className="text-center py-6">
                <p className="text-3xl font-bold text-amber-600 mb-2">{dash?.pending?.reportApprovals ?? 0}</p>
                <p className="text-sm text-slate-500 mb-4">rapor inceleme bekliyor</p>
                <Link href="/reports/review"><Button variant="outline" size="sm">İncele</Button></Link>
              </div>
            )
          )}
        </div>
      </Card>

      {extLoading ? null : (ext?.techManagerWorkload?.count ?? 0) > 0 && (
        <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-300 flex items-center gap-3">
          <Briefcase className="w-4 h-4 flex-shrink-0" />
          <span><strong>{ext.techManagerWorkload.count}</strong> teknik yönetici onayı bekliyor.</span>
        </div>
      )}
    </>
  );
}

/* ─── FINANCE Dashboard ─── */
function FinanceDashboard({ dash, isLoading }: { dash: any; isLoading: boolean }) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Faturalanmamış" value={isLoading ? '—' : (dash?.pending?.uninvoicedWorkOrders ?? 0)} icon={<CreditCard className="w-5 h-5 text-violet-600" />} color="bg-violet-50 dark:bg-violet-950/40" loading={isLoading} />
        <StatCard label="LOGO Hataları" value={isLoading ? '—' : (dash?.pending?.logoSyncFailed ?? 0)} icon={<AlertTriangle className="w-5 h-5 text-red-600" />} color="bg-red-50 dark:bg-red-950/40" loading={isLoading} />
        <StatCard label="Sözleşmesiz İşler" value={isLoading ? '—' : (dash?.pending?.noContractRiskOrders ?? 0)} icon={<ShieldAlert className="w-5 h-5 text-amber-600" />} color="bg-amber-50 dark:bg-amber-950/40" loading={isLoading} />
        <StatCard label="Toplam Bekleyen" value={isLoading ? '—' : ((dash?.pending?.uninvoicedWorkOrders ?? 0) + (dash?.pending?.logoSyncFailed ?? 0))} icon={<Receipt className="w-5 h-5 text-teal-600" />} color="bg-teal-50 dark:bg-teal-950/40" loading={isLoading} />
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3 mb-6">
        <Link href="/invoicing"><Button icon={<CreditCard className="w-4 h-4" />}>Faturalama</Button></Link>
        <Link href="/logo"><Button variant="outline" icon={<Zap className="w-4 h-4" />}>LOGO Kuyruğu</Button></Link>
      </div>

      {/* Alert banners */}
      {!isLoading && dash?.pending?.logoSyncFailed > 0 && (
        <div className="mb-4 flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span><strong>{dash.pending.logoSyncFailed}</strong> LOGO senkronizasyon hatası var.</span>
          <Link href="/logo" className="ml-auto text-xs font-semibold underline">İncele →</Link>
        </div>
      )}
      {!isLoading && dash?.pending?.noContractRiskOrders > 0 && (
        <div className="mb-4 flex items-center gap-3 p-4 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-xl text-sm text-orange-700 dark:text-orange-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span><strong>{dash.pending.noContractRiskOrders}</strong> iş emri sözleşmesiz başlatılmış.</span>
          <Link href="/work-orders" className="ml-auto text-xs font-semibold underline">İncele →</Link>
        </div>
      )}
    </>
  );
}

/* ─── FULL (Admin/Executive) Dashboard ─── */
function FullDashboard({
  dash, isLoading, stats, statsLoading, upcoming, ext, extLoading,
}: {
  dash: any; isLoading: boolean; stats: any[]; statsLoading: boolean; upcoming: any[]; ext: any; extLoading: boolean;
}) {
  return (
    <>
      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Bugünkü İş Emirleri"
          value={isLoading ? '—' : (dash?.today?.workOrders ?? 0)}
          icon={<ClipboardList className="w-5 h-5 text-teal-600" />}
          color="bg-teal-50 dark:bg-teal-950/40"
          loading={isLoading}
        />
        <StatCard
          label="Onay Bekleyen Raporlar"
          value={isLoading ? '—' : (dash?.pending?.reportApprovals ?? 0)}
          icon={<FileText className="w-5 h-5 text-amber-600" />}
          color="bg-amber-50 dark:bg-amber-950/40"
          loading={isLoading}
        />
        <StatCard
          label="30 Gün İçinde Kontrol"
          value={isLoading ? '—' : (dash?.upcoming?.equipmentControls30Days ?? 0)}
          icon={<Package className="w-5 h-5 text-emerald-600" />}
          color="bg-emerald-50 dark:bg-emerald-950/40"
          loading={isLoading}
        />
        <StatCard
          label="Faturalanmamış İşler"
          value={isLoading ? '—' : (dash?.pending?.uninvoicedWorkOrders ?? 0)}
          icon={<CreditCard className="w-5 h-5 text-violet-600" />}
          color="bg-violet-50 dark:bg-violet-950/40"
          loading={isLoading}
        />
      </div>

      {/* Alert banners */}
      {!isLoading && dash?.pending?.logoSyncFailed > 0 && (
        <div className="mb-4 flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span><strong>{dash.pending.logoSyncFailed}</strong> LOGO senkronizasyon hatası var.</span>
          <Link href="/logo" className="ml-auto text-xs font-semibold underline">İncele →</Link>
        </div>
      )}
      {!isLoading && dash?.pending?.noContractRiskOrders > 0 && (
        <div className="mb-4 flex items-center gap-3 p-4 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-xl text-sm text-orange-700 dark:text-orange-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span><strong>{dash.pending.noContractRiskOrders}</strong> iş emri sözleşmesiz başlatılmış.</span>
          <Link href="/work-orders" className="ml-auto text-xs font-semibold underline">İncele →</Link>
        </div>
      )}
      {!isLoading && dash?.pending?.overdueReports > 0 && (
        <div className="mb-4 flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-300">
          <Clock className="w-4 h-4 flex-shrink-0" />
          <span><strong>{dash.pending.overdueReports}</strong> rapor 7 günden fazladır bekliyor.</span>
          <Link href="/reports/review" className="ml-auto text-xs font-semibold underline">İncele →</Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly chart */}
        <Card className="lg:col-span-2" padding="none">
          <div className="p-5 pb-0">
            <CardHeader>
              <CardTitle>Aylık Denetim İstatistikleri</CardTitle>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />Toplam</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Uygun</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Uygunsuz</span>
              </div>
            </CardHeader>
          </div>
          <div className="px-2 pb-4">
            {statsLoading ? (
              <Skeleton className="h-52 mx-4" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={stats} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3366f5" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3366f5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="total" stroke="#3366f5" strokeWidth={2} fill="url(#gTotal)" name="Toplam" />
                  <Area type="monotone" dataKey="compliant" stroke="#10b981" strokeWidth={2} fill="none" name="Uygun" />
                  <Area type="monotone" dataKey="nonCompliant" stroke="#f87171" strokeWidth={2} fill="none" name="Uygunsuz" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Upcoming controls */}
        <UpcomingControlsWidget upcoming={upcoming} />
      </div>

      {/* Detaylı İstatistikler */}
      <div className="mt-6">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4">Detaylı İstatistikler</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            label="Süresi Dolacak Sertifikalar"
            value={extLoading ? '—' : (ext?.expiringCertificates?.count ?? 0)}
            icon={<ShieldAlert className="w-5 h-5 text-red-600" />}
            color="bg-red-50 dark:bg-red-950/40"
            loading={extLoading}
          />
          <StatCard
            label="Satış Performansı"
            value={extLoading ? '—' : `${ext?.salesPerformance?.accepted ?? 0} / ${ext?.salesPerformance?.total ?? 0}`}
            icon={<BarChart3 className="w-5 h-5 text-teal-600" />}
            color="bg-teal-50 dark:bg-teal-950/40"
            loading={extLoading}
          />
          <StatCard
            label="Planlama Yoğunluğu"
            value={extLoading ? '—' : `${ext?.planningLoad?.length ?? 0} muayene personeli`}
            icon={<CalendarClock className="w-5 h-5 text-indigo-600" />}
            color="bg-indigo-50 dark:bg-indigo-950/40"
            loading={extLoading}
          />
          <StatCard
            label="TY Bekleyen İş Yükü"
            value={extLoading ? '—' : (ext?.techManagerWorkload?.count ?? 0)}
            icon={<Briefcase className="w-5 h-5 text-amber-600" />}
            color="bg-amber-50 dark:bg-amber-950/40"
            loading={extLoading}
          />
          <StatCard
            label="Müşteri İş Hacmi"
            value={extLoading ? '—' : (ext?.customerVolume?.slice(0, 3).map((c: any) => c.name).join(', ') || '—')}
            icon={<Users className="w-5 h-5 text-emerald-600" />}
            color="bg-emerald-50 dark:bg-emerald-950/40"
            loading={extLoading}
          />
          <StatCard
            label="Ekipman Tipi Dağılımı"
            value={extLoading ? '—' : (ext?.equipmentTypeStats?.slice(0, 3).map((t: any) => t.type || t.name).join(', ') || '—')}
            icon={<Wrench className="w-5 h-5 text-violet-600" />}
            color="bg-violet-50 dark:bg-violet-950/40"
            loading={extLoading}
          />
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const { user } = useAuthStore();
  const [showAllStats, setShowAllStats] = useState(false);

  // Role detection
  const userRoles = user?.roles ? String(user.roles).split(',') : [user?.role || 'admin'];
  const primaryRole = userRoles.includes('admin') || userRoles.includes('executive') ? 'admin' :
    userRoles.includes('sales') ? 'sales' :
    userRoles.includes('planner') ? 'planner' :
    userRoles.includes('inspector') ? 'inspector' :
    userRoles.includes('technical_manager') ? 'technical_manager' :
    userRoles.includes('finance') ? 'finance' : 'admin';

  // Data queries (shared across roles, conditionally used)
  const { data: dashData, isLoading } = useMainDashboard();
  const { data: monthlyStats, isLoading: statsLoading } = useQuery({
    queryKey: ['monthly-stats'],
    queryFn: () => dashboardApi.getMonthlyStats(6),
    enabled: primaryRole === 'admin',
  });
  const { data: timeline } = useQuery({
    queryKey: ['equipment-timeline'],
    queryFn: () => dashboardApi.getEquipmentTimeline(30),
    enabled: primaryRole === 'admin' || primaryRole === 'sales',
  });
  const { data: extendedData, isLoading: extLoading } = useQuery({
    queryKey: ['dashboard-extended'],
    queryFn: () => dashboardApi.getExtended(),
    enabled: primaryRole === 'admin' || primaryRole === 'technical_manager' || showAllStats,
  });

  const dash = (dashData as any)?.data;
  const stats = (monthlyStats as any)?.data || [];
  const upcoming = (timeline as any)?.data || [];
  const ext = (extendedData as any)?.data;

  return (
    <>
      <PageHeader
        title={`Merhaba, ${user?.fullName?.split(' ')[0]} 👋`}
        subtitle={`${new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
      />

      {primaryRole === 'sales' && <SalesDashboard dash={ext} isLoading={extLoading || isLoading} upcoming={upcoming} />}
      {primaryRole === 'planner' && <PlannerDashboard dash={dash} isLoading={isLoading} />}
      {primaryRole === 'inspector' && <InspectorDashboard dash={dash} isLoading={isLoading} />}
      {primaryRole === 'technical_manager' && <TechManagerDashboard dash={dash} isLoading={isLoading} ext={ext} extLoading={extLoading} />}
      {primaryRole === 'finance' && <FinanceDashboard dash={dash} isLoading={isLoading} />}
      {primaryRole === 'admin' && (
        <FullDashboard
          dash={dash} isLoading={isLoading}
          stats={stats} statsLoading={statsLoading}
          upcoming={upcoming}
          ext={ext} extLoading={extLoading}
        />
      )}

      {/* Expandable full stats for non-admin roles */}
      {primaryRole !== 'admin' && (
        <div className="mt-8">
          <button
            onClick={() => setShowAllStats(!showAllStats)}
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition"
          >
            {showAllStats ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {showAllStats ? 'Tüm İstatistikleri Gizle' : 'Tüm İstatistikleri Göster'}
          </button>
          {showAllStats && (
            <div className="mt-4">
              <FullDashboard
                dash={dash} isLoading={isLoading}
                stats={stats} statsLoading={statsLoading}
                upcoming={upcoming}
                ext={ext} extLoading={extLoading}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
