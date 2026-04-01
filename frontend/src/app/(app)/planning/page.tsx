'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { workOrdersApi, usersApi } from '@/lib/api';
import { PageHeader, Card, Badge, Button, Select } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  ChevronLeft, ChevronRight, Calendar, Users,
  Plus, RefreshCw, Clock, MapPin, Package,
} from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, addMonths, subMonths,
  isSameDay, isSameMonth, isToday, parseISO,
} from 'date-fns';
import { tr } from 'date-fns/locale';

const STATUS_COLORS: Record<string, string> = {
  draft:           'bg-slate-500/20 border-l-slate-400 text-slate-300',
  planned:         'bg-blue-500/20 border-l-blue-400 text-blue-300',
  assigned:        'bg-violet-500/20 border-l-violet-400 text-violet-300',
  in_progress:     'bg-amber-500/20 border-l-amber-400 text-amber-300',
  postponed:       'bg-orange-500/20 border-l-orange-400 text-orange-300',
  completed:       'bg-green-500/20 border-l-green-400 text-green-300',
  report_pending:  'bg-cyan-500/20 border-l-cyan-400 text-cyan-300',
  report_approved: 'bg-teal-500/20 border-l-teal-400 text-teal-300',
  invoiced:        'bg-slate-500/10 border-l-slate-500 text-slate-400',
  cancelled:       'bg-red-500/20 border-l-red-400 text-red-400',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Taslak', planned: 'Planlandı', assigned: 'Atandı',
  in_progress: 'Devam Ediyor', postponed: 'Ertelendi', completed: 'Tamamlandı',
  report_pending: 'Rapor Bekliyor', report_approved: 'Rapor Onaylı',
  invoiced: 'Faturalandı', cancelled: 'İptal',
};

export default function PlanningPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [inspectorFilter, setInspectorFilter] = useState('');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  const { data: woData, isLoading, refetch } = useQuery({
    queryKey: ['work-orders-planning', format(calStart, 'yyyy-MM-dd'), format(calEnd, 'yyyy-MM-dd'), inspectorFilter],
    queryFn: () => workOrdersApi.list({
      startDate: format(calStart, 'yyyy-MM-dd'),
      endDate: format(calEnd, 'yyyy-MM-dd'),
      inspectorId: inspectorFilter || undefined,
      limit: 500,
    }),
  });

  const { data: usersData } = useQuery({
    queryKey: ['inspectors'],
    queryFn: () => usersApi.list({ limit: 100 }),
  });

  const workOrders = (woData as any)?.data?.data || (woData as any)?.data || [];
  const allUsers = (usersData as any)?.data?.data || (usersData as any)?.data || [];
  const inspectors = allUsers.filter((u: any) => (u.roles || u.role || '').includes('inspector'));

  const getOrdersForDay = (day: Date) =>
    workOrders.filter((wo: any) => wo.plannedDate && isSameDay(parseISO(wo.plannedDate), day));

  const selectedOrders = selectedDay ? getOrdersForDay(selectedDay) : [];

  const totalOrders = workOrders.length;
  const uniqueInspectors = new Set(workOrders.map((w: any) => w.assignedInspectorId).filter(Boolean)).size;

  return (
    <>
      <PageHeader
        title="Planlama Takvimi"
        subtitle={format(currentMonth, 'MMMM yyyy', { locale: tr })}
        actions={
          <>
            <Select
              options={[
                { value: '', label: 'Tüm Muayene Elemanları' },
                ...inspectors.map((u: any) => ({ value: u.id, label: u.fullName })),
              ]}
              value={inspectorFilter}
              onChange={(e) => setInspectorFilter(e.target.value)}
              className="w-52"
            />
            <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => window.location.href = '/work-orders/new'}>
              İş Emri Ekle
            </Button>
          </>
        }
      />

      {/* Ay navigasyonu */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={() => setCurrentMonth(new Date())}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-600 hover:bg-teal-100">
            Bu Ay
          </button>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-4 text-sm text-slate-500">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" /> {totalOrders} iş emri
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="w-4 h-4" /> {uniqueInspectors} muayene elemanı
          </span>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Aylık takvim */}
        <div className="flex-1">
          <Card padding="none">
            {/* Gün başlıkları */}
            <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700">
              {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(d => (
                <div key={d} className="text-center py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {d}
                </div>
              ))}
            </div>

            {/* Günler */}
            <div className="grid grid-cols-7">
              {calDays.map((day) => {
                const orders = getOrdersForDay(day);
                const today = isToday(day);
                const inMonth = isSameMonth(day, currentMonth);
                const isSelected = selectedDay && isSameDay(day, selectedDay);

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                    className={cn(
                      'min-h-[90px] p-1.5 border-b border-r border-slate-100 dark:border-slate-800 text-left transition-all',
                      !inMonth && 'opacity-30',
                      isSelected && 'bg-teal-950/30 ring-1 ring-teal-500 ring-inset',
                      !isSelected && 'hover:bg-slate-50 dark:hover:bg-slate-800/30',
                    )}
                  >
                    {/* Gün numarası */}
                    <div className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mb-1',
                      today ? 'bg-teal-600 text-white' : 'text-slate-500 dark:text-slate-400',
                    )}>
                      {format(day, 'd')}
                    </div>

                    {/* İş emirleri */}
                    <div className="space-y-0.5">
                      {orders.slice(0, 3).map((wo: any) => (
                        <div
                          key={wo.id}
                          className={cn(
                            'text-[10px] leading-tight px-1.5 py-0.5 rounded border-l-2 truncate',
                            STATUS_COLORS[wo.status] || STATUS_COLORS.draft,
                          )}
                        >
                          {wo.workOrderNumber?.replace('IE-2026-', '')} {wo.customer?.name?.substring(0, 15)}
                        </div>
                      ))}
                      {orders.length > 3 && (
                        <div className="text-[10px] text-slate-400 px-1.5">+{orders.length - 3} daha</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Durum renkleri açıklama */}
          <div className="flex flex-wrap gap-3 mt-3 px-1">
            {Object.entries(STATUS_LABELS).slice(0, 7).map(([key, label]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={cn('w-2.5 h-2.5 rounded-sm border-l-2', STATUS_COLORS[key])} />
                <span className="text-[10px] text-slate-500">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sağ panel - seçili gün detayı */}
        <div className="w-80 flex-shrink-0 hidden lg:block">
          <Card className="sticky top-4">
            {selectedDay ? (
              <>
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-200 dark:border-slate-700">
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center font-bold',
                    isToday(selectedDay) ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
                  )}>
                    {format(selectedDay, 'd')}
                  </div>
                  <div>
                    <p className="font-bold text-sm">{format(selectedDay, 'EEEE', { locale: tr })}</p>
                    <p className="text-xs text-slate-400">{format(selectedDay, 'd MMMM yyyy', { locale: tr })}</p>
                  </div>
                </div>

                {selectedOrders.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Bu gün için iş emri yok</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      {selectedOrders.length} İş Emri
                    </p>
                    {selectedOrders.map((wo: any) => (
                      <a
                        key={wo.id}
                        href={`/work-orders/${wo.id}`}
                        className={cn(
                          'block p-3 rounded-lg border-l-3 transition-all hover:shadow-md',
                          STATUS_COLORS[wo.status] || STATUS_COLORS.draft,
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-sm">{wo.workOrderNumber}</span>
                          <Badge color={STATUS_COLORS[wo.status]?.replace('border-l-', 'bg-').split(' ')[0]}>
                            {STATUS_LABELS[wo.status] || wo.status}
                          </Badge>
                        </div>
                        <p className="text-xs font-medium truncate mb-2">{wo.customer?.name || '—'}</p>

                        {wo.plannedTime && (
                          <div className="flex items-center gap-1 text-[11px] opacity-70 mb-1">
                            <Clock className="w-3 h-3" /> {wo.plannedTime.slice(0, 5)}
                          </div>
                        )}
                        {wo.location?.name && (
                          <div className="flex items-center gap-1 text-[11px] opacity-70 mb-1">
                            <MapPin className="w-3 h-3" /> {wo.location.name}
                          </div>
                        )}
                        {wo.assignedInspector?.fullName && (
                          <div className="flex items-center gap-1 text-[11px] opacity-70 mb-1">
                            <Users className="w-3 h-3" /> {wo.assignedInspector.fullName}
                          </div>
                        )}
                        {(wo.equipmentItems?.length > 0 || wo.equipmentCount > 0) && (
                          <div className="flex items-center gap-1 text-[11px] opacity-70">
                            <Package className="w-3 h-3" /> {wo.equipmentItems?.length || wo.equipmentCount} ekipman
                          </div>
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <Calendar className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">Bir gün seçin</p>
                <p className="text-xs mt-1">Takvimde bir güne tıklayarak detayları görün</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
