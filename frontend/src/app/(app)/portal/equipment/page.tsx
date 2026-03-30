'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { portalApi } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, SearchInput,
  SkeletonTable, EmptyState,
} from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { Package, AlertTriangle, Search } from 'lucide-react';

export default function PortalEquipmentPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['portal-equipment'],
    queryFn: () => portalApi.getEquipment(),
  });

  const equipment = (data as any)?.data || [];

  const filtered = equipment.filter((eq: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      eq.inventoryCode?.toLowerCase().includes(q) ||
      eq.serialNumber?.toLowerCase().includes(q)
    );
  });

  const getControlStatus = (nextDate: string | null) => {
    if (!nextDate) return { label: 'Belirsiz', color: 'bg-slate-100 text-slate-500', days: null };
    const days = Math.ceil((new Date(nextDate).getTime() - Date.now()) / 86400000);
    if (days < 0) return { label: `${Math.abs(days)}g Gecikmiş`, color: 'bg-red-100 text-red-700', days };
    if (days <= 14) return { label: `${days}g Kaldı`, color: 'bg-amber-100 text-amber-700', days };
    if (days <= 30) return { label: `${days}g Kaldı`, color: 'bg-yellow-100 text-yellow-700', days };
    return { label: `${days}g Kaldı`, color: 'bg-green-100 text-green-700', days };
  };

  const overdueCount = equipment.filter(
    (e: any) => e.nextControlDate && new Date(e.nextControlDate) < new Date(),
  ).length;

  return (
    <>
      <PageHeader
        title="Ekipmanlarım"
        subtitle={`${equipment.length} ekipman kayıtlı`}
      />

      {overdueCount > 0 && (
        <div className="mb-4 flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              {overdueCount} ekipmanın periyodik kontrol tarihi geçmiş!
            </p>
            <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">
              Lütfen en kısa sürede yetkili firma ile iletişime geçiniz.
            </p>
          </div>
        </div>
      )}

      <Card padding="none">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Envanter kodu veya seri numarası ara..."
            className="max-w-sm"
          />
        </div>

        {isLoading ? (
          <SkeletonTable rows={6} cols={7} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Package className="w-12 h-12" />}
            title="Ekipman bulunamadı"
            description={search ? 'Arama kriterlerinizi değiştirin' : 'Kayıtlı ekipman yok'}
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Envanter Kodu</th>
                <th>Ekipman Tipi</th>
                <th>Marka / Model</th>
                <th>Kapasite</th>
                <th>Son Kontrol</th>
                <th>Sonraki Kontrol</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((eq: any) => {
                const status = getControlStatus(eq.nextControlDate);
                const isOverdue = status.days !== null && status.days < 0;
                const isUpcoming = status.days !== null && status.days >= 0 && status.days <= 14;

                return (
                  <tr key={eq.id} className={isOverdue ? 'bg-red-50/50 dark:bg-red-950/10' : ''}>
                    <td>
                      <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {eq.inventoryCode}
                      </span>
                    </td>
                    <td>
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {eq.equipmentType?.name || '—'}
                      </span>
                    </td>
                    <td>
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {eq.brand && eq.model ? `${eq.brand} / ${eq.model}` : eq.brand || eq.model || '—'}
                      </span>
                    </td>
                    <td>
                      <span className="text-sm text-slate-500">
                        {eq.capacity ? `${eq.capacity} ${eq.capacityUnit || ''}`.trim() : '—'}
                      </span>
                    </td>
                    <td>
                      <span className="text-sm text-slate-500">
                        {formatDate(eq.lastControlDate)}
                      </span>
                    </td>
                    <td>
                      <span className={`text-sm font-semibold ${isOverdue ? 'text-red-600' : isUpcoming ? 'text-amber-600' : 'text-slate-700 dark:text-slate-300'}`}>
                        {formatDate(eq.nextControlDate)}
                      </span>
                    </td>
                    <td>
                      <Badge color={status.color} dot>
                        {status.label}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
