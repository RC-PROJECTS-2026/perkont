'use client';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { portalApi } from '@/lib/api';
import {
  PageHeader, Card, Badge, StatCard, EmptyState,
} from '@/components/ui';
import { formatDate } from '@/lib/utils';
import {
  Calendar, AlertTriangle, Clock, CheckCircle2,
  Package,
} from 'lucide-react';

export default function PortalUpcomingPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['portal-upcoming'],
    queryFn: () => portalApi.getEquipment(),
  });

  const allEquipment = (data as any)?.data || [];
  const now = new Date();

  // Tüm kontrol gerektiren ekipmanları filtrele (gecikmiş + 90 gün içi)
  const { overdue, thisWeek, upcoming, grouped } = useMemo(() => {
    const overdue: any[] = [];
    const thisWeek: any[] = [];
    const upcoming: any[] = [];

    allEquipment.forEach((e: any) => {
      if (!e.nextControlDate) return;
      const d = new Date(e.nextControlDate);
      const days = Math.ceil((d.getTime() - now.getTime()) / 86400000);
      if (days < 0) overdue.push({ ...e, _days: days });
      else if (days <= 7) thisWeek.push({ ...e, _days: days });
      else if (days <= 90) upcoming.push({ ...e, _days: days });
    });

    // Tarih sırasına göre sırala
    overdue.sort((a: any, b: any) => a._days - b._days);
    thisWeek.sort((a: any, b: any) => a._days - b._days);
    upcoming.sort((a: any, b: any) => a._days - b._days);

    // Ay bazında gruplama (yaklaşan kontrolller)
    const grouped: Record<string, any[]> = {};
    upcoming.forEach((e: any) => {
      const d = new Date(e.nextControlDate);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
      if (!grouped[monthKey]) grouped[monthKey] = [];
      (e as any)._monthLabel = monthLabel;
      grouped[monthKey].push(e);
    });

    return { overdue, thisWeek, upcoming, grouped };
  }, [allEquipment]);

  const getMonthLabel = (items: any[]) => items[0]?._monthLabel || '';

  return (
    <>
      <PageHeader
        title="Yaklaşan Kontroller"
        subtitle="Kontrol takvimi ve gecikmiş ekipmanlar (90 gün)"
      />

      {/* İstatistikler */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Gecikmiş"
          value={overdue.length}
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
          color="bg-red-50 dark:bg-red-950/40"
        />
        <StatCard
          label="Bu Hafta"
          value={thisWeek.length}
          icon={<Clock className="w-5 h-5 text-amber-600" />}
          color="bg-amber-50 dark:bg-amber-950/40"
        />
        <StatCard
          label="90 Gün İçinde"
          value={upcoming.length}
          icon={<Calendar className="w-5 h-5 text-green-600" />}
          color="bg-green-50 dark:bg-green-950/40"
        />
        <StatCard
          label="Toplam Ekipman"
          value={allEquipment.length}
          icon={<Package className="w-5 h-5 text-slate-600" />}
          color="bg-slate-50 dark:bg-slate-800"
        />
      </div>

      {/* Gecikmiş Kontroller */}
      {overdue.length > 0 && (
        <div className="mb-6">
          <h2 className="font-bold text-sm text-red-600 uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Gecikmiş Kontroller
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {overdue.map((e: any) => (
              <EquipmentCard key={e.id} equipment={e} variant="overdue" />
            ))}
          </div>
        </div>
      )}

      {/* Bu Hafta */}
      {thisWeek.length > 0 && (
        <div className="mb-6">
          <h2 className="font-bold text-sm text-amber-600 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Bu Hafta
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {thisWeek.map((e: any) => (
              <EquipmentCard key={e.id} equipment={e} variant="urgent" />
            ))}
          </div>
        </div>
      )}

      {/* Aya göre gruplu yaklaşan kontroller */}
      {Object.keys(grouped).length > 0 ? (
        Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([monthKey, items]) => (
            <div key={monthKey} className="mb-6">
              <h2 className="font-bold text-sm text-green-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4" /> {getMonthLabel(items)}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((e: any) => (
                  <EquipmentCard key={e.id} equipment={e} variant="upcoming" />
                ))}
              </div>
            </div>
          ))
      ) : !isLoading && overdue.length === 0 && thisWeek.length === 0 && (
        <Card>
          <EmptyState
            icon={<CheckCircle2 className="w-12 h-12" />}
            title="Yaklaşan kontrol yok"
            description="Önümüzdeki 90 günde periyodik kontrole tabi ekipman bulunmuyor"
          />
        </Card>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 skeleton rounded-xl" />
          ))}
        </div>
      )}
    </>
  );
}

function EquipmentCard({ equipment: e, variant }: { equipment: any; variant: 'overdue' | 'urgent' | 'upcoming' }) {
  const days = e._days as number;

  const borderColor =
    variant === 'overdue' ? 'border-red-200 dark:border-red-800' :
    variant === 'urgent'  ? 'border-amber-200 dark:border-amber-800' :
    'border-green-200 dark:border-green-800';

  const bgColor =
    variant === 'overdue' ? 'bg-red-50/50 dark:bg-red-950/20' :
    variant === 'urgent'  ? 'bg-amber-50/50 dark:bg-amber-950/20' :
    'bg-green-50/30 dark:bg-green-950/10';

  const badgeColor =
    variant === 'overdue' ? 'bg-red-100 text-red-700' :
    variant === 'urgent'  ? 'bg-amber-100 text-amber-700' :
    'bg-green-100 text-green-700';

  const dayLabel =
    variant === 'overdue' ? `${Math.abs(days)}g gecikmiş` :
    days === 0 ? 'Bugün' :
    days === 1 ? 'Yarın' :
    `${days}g kaldı`;

  return (
    <Card className={`border ${borderColor} ${bgColor}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <p className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
            {e.inventoryCode}
          </p>
          <p className="text-xs text-slate-400 truncate">{e.equipmentType?.name}</p>
        </div>
        <Badge color={badgeColor}>{dayLabel}</Badge>
      </div>

      <div className="space-y-1.5 text-xs">
        {e.brand && (
          <div className="flex justify-between">
            <span className="text-slate-400">Marka / Model</span>
            <span className="text-slate-600 dark:text-slate-400 truncate max-w-[140px]">
              {e.brand} {e.model || ''}
            </span>
          </div>
        )}
        {e.capacity && (
          <div className="flex justify-between">
            <span className="text-slate-400">Kapasite</span>
            <span className="text-slate-600 dark:text-slate-400">
              {e.capacity} {e.capacityUnit || ''}
            </span>
          </div>
        )}
        {e.location?.name && (
          <div className="flex justify-between">
            <span className="text-slate-400">Lokasyon</span>
            <span className="text-slate-600 dark:text-slate-400 truncate max-w-[140px]">{e.location.name}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-slate-400">Son Kontrol</span>
          <span className="text-slate-500">{formatDate(e.lastControlDate)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Sonraki Kontrol</span>
          <span className={`font-semibold ${variant === 'overdue' ? 'text-red-600' : variant === 'urgent' ? 'text-amber-600' : 'text-green-600'}`}>
            {formatDate(e.nextControlDate)}
          </span>
        </div>
      </div>
    </Card>
  );
}
