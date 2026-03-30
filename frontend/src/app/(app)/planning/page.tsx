'use client';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { workOrdersApi, usersApi, useMutationWithToast } from '@/lib/api';
import { PageHeader, Card, Badge, Button, Select } from '@/components/ui';
import { formatDate, WORK_ORDER_STATUS_LABELS } from '@/lib/utils';
import {
  ChevronLeft, ChevronRight, Calendar, Users,
  Plus, RefreshCw, Clock,
} from 'lucide-react';
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval,
  addWeeks, subWeeks, isSameDay, isToday, parseISO,
} from 'date-fns';
import { tr } from 'date-fns/locale';

export default function PlanningPage() {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [inspectorFilter, setInspectorFilter] = useState('');

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd   = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekDays  = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const { data: woData, isLoading, refetch } = useQuery({
    queryKey: ['work-orders-planning', format(weekStart, 'yyyy-MM-dd'), inspectorFilter],
    queryFn: () => workOrdersApi.list({
      startDate: format(weekStart, 'yyyy-MM-dd'),
      endDate:   format(weekEnd,   'yyyy-MM-dd'),
      inspectorId: inspectorFilter || undefined,
      limit: 200,
    }),
  });

  const { data: usersData } = useQuery({
    queryKey: ['inspectors'],
    queryFn: () => usersApi.list({ limit: 100 }),
  });

  const workOrders = (woData as any)?.data?.data || [];
  const inspectors = ((usersData as any)?.data?.data || []).filter(
    (u: any) => u.role === 'inspector',
  );

  const getOrdersForDay = (day: Date) =>
    workOrders.filter((wo: any) =>
      wo.plannedDate && isSameDay(parseISO(wo.plannedDate), day),
    );

  const statusColors: Record<string, string> = {
    draft:           'bg-slate-100 border-slate-300 text-slate-600',
    planned:         'bg-blue-50  border-blue-200  text-blue-700',
    assigned:        'bg-violet-50 border-violet-200 text-violet-700',
    in_progress:     'bg-amber-50 border-amber-200  text-amber-700',
    completed:       'bg-green-50 border-green-200  text-green-700',
    report_approved: 'bg-teal-50  border-teal-200   text-teal-700',
    invoiced:        'bg-slate-50 border-slate-200  text-slate-500',
  };

  return (
    <>
      <PageHeader
        title="Planlama Takvimi"
        subtitle={`${format(weekStart, 'd MMM', { locale: tr })} — ${format(weekEnd, 'd MMM yyyy', { locale: tr })}`}
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

      {/* Week navigator */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setCurrentWeek(new Date())}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-600 hover:bg-teal-100"
          >
            Bu Hafta
          </button>
          <button
            onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Summary stats */}
        <div className="flex items-center gap-4 text-sm text-slate-500">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            {workOrders.length} iş emri
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="w-4 h-4" />
            {new Set(workOrders.map((w: any) => w.assignedInspectorId).filter(Boolean)).size} muayene elemanı
          </span>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-3">
        {weekDays.map((day) => {
          const orders = getOrdersForDay(day);
          const today  = isToday(day);

          return (
            <div key={day.toISOString()} className="min-h-40">
              {/* Day header */}
              <div className={`
                text-center p-2 rounded-xl mb-2 font-semibold text-sm
                ${today
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }
              `}>
                <div className="text-xs font-medium opacity-70">
                  {format(day, 'EEE', { locale: tr })}
                </div>
                <div className="text-lg font-extrabold">{format(day, 'd')}</div>
              </div>

              {/* Work orders */}
              <div className="space-y-1.5">
                {orders.map((wo: any) => (
                  <a
                    key={wo.id}
                    href={`/work-orders/${wo.id}`}
                    className={`
                      block p-2 rounded-lg border text-xs transition-all hover:shadow-sm
                      ${statusColors[wo.status] || 'bg-slate-50 border-slate-200 text-slate-600'}
                    `}
                  >
                    <div className="font-bold truncate">{wo.workOrderNumber}</div>
                    <div className="truncate opacity-75 mt-0.5">{wo.customer?.name}</div>
                    {wo.plannedTime && (
                      <div className="flex items-center gap-1 mt-1 opacity-60">
                        <Clock className="w-3 h-3" />
                        {wo.plannedTime.slice(0, 5)}
                      </div>
                    )}
                    {wo.equipmentItems?.length > 0 && (
                      <div className="mt-1 opacity-60">{wo.equipmentItems.length} ekipman</div>
                    )}
                  </a>
                ))}

                {isLoading && (
                  <div className="h-8 skeleton rounded-lg" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Inspector workload table */}
      {inspectors.length > 0 && (
        <Card className="mt-6">
          <div className="mb-4 font-display font-bold text-base text-slate-900 dark:text-slate-100">
            Muayene Elemanı İş Yükü — Bu Hafta
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Muayene Elemanı</th>
                  {weekDays.map((d) => (
                    <th key={d.toISOString()} className={isToday(d) ? 'bg-teal-50 dark:bg-teal-950/30 text-teal-600' : ''}>
                      {format(d, 'EEE d', { locale: tr })}
                    </th>
                  ))}
                  <th>Toplam</th>
                </tr>
              </thead>
              <tbody>
                {inspectors.map((inspector: any) => {
                  const dailyCounts = weekDays.map((day) =>
                    workOrders.filter(
                      (wo: any) =>
                        wo.assignedInspectorId === inspector.id &&
                        wo.plannedDate &&
                        isSameDay(parseISO(wo.plannedDate), day),
                    ).length,
                  );
                  const total = dailyCounts.reduce((a, b) => a + b, 0);
                  if (total === 0) return null;

                  return (
                    <tr key={inspector.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-xs font-bold">{inspector.fullName.charAt(0)}</span>
                          </div>
                          <span className="text-sm font-medium">{inspector.fullName}</span>
                        </div>
                      </td>
                      {dailyCounts.map((count, i) => (
                        <td key={i} className={`text-center ${isToday(weekDays[i]) ? 'bg-teal-50 dark:bg-teal-950/20' : ''}`}>
                          {count > 0 ? (
                            <span className={`
                              inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                              ${count >= 4 ? 'bg-red-100 text-red-700' : count >= 2 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}
                            `}>
                              {count}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      ))}
                      <td className="text-center font-bold text-slate-700 dark:text-slate-300">{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
