'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Building2, Search } from 'lucide-react';
import { customersApi } from '@/lib/api';
import { PageHeader, Card, SearchInput, StatCard, EmptyState } from '@/components/ui';
import Link from 'next/link';

export default function LocationsPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['customers-locations', search],
    queryFn: () => customersApi.list({ search: search || undefined, limit: 50 }),
  });

  const raw = (data as any)?.data;
  const customers = Array.isArray(raw) ? raw : (raw?.data || []);

  // Lokasyonları düzleştir
  const allLocations = customers.flatMap((c: any) =>
    (c.locations || []).map((loc: any) => ({ ...loc, customerName: c.name, customerId: c.id }))
  );

  return (
    <div>
      <PageHeader title="Lokasyonlar" subtitle={`${allLocations.length} lokasyon`} />

      <div className="mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Müşteri veya lokasyon ara..." />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="animate-pulse h-28 bg-slate-800/50 rounded-xl" />
          ))}
        </div>
      ) : allLocations.length === 0 ? (
        <EmptyState
          icon={<MapPin className="w-12 h-12" />}
          title="Lokasyon bulunamadı"
          description={search ? 'Aramanızla eşleşen lokasyon yok' : 'Henüz lokasyon eklenmemiş'}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allLocations.map((loc: any) => (
            <Card key={loc.id} hover>
              <Link href={`/customers/${loc.customerId}`}>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-teal-900/30 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-4 h-4 text-teal-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-slate-100 truncate">{loc.name}</p>
                    <p className="text-xs text-teal-400 mt-0.5">{loc.customerName}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {loc.city}{loc.district ? ` / ${loc.district}` : ''}
                    </p>
                  </div>
                </div>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
