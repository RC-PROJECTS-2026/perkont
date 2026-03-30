'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { portalApi } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, SearchInput,
  SkeletonTable, EmptyState,
} from '@/components/ui';
import { formatDate, formatCurrency } from '@/lib/utils';
import {
  Briefcase, Download, AlertTriangle, CheckCircle2,
  FileText, RefreshCw,
} from 'lucide-react';

const statusColors: Record<string, string> = {
  draft:      'bg-slate-100 text-slate-500',
  sent:       'bg-blue-100 text-blue-700',
  signed:     'bg-emerald-100 text-emerald-700',
  active:     'bg-green-100 text-green-700',
  expired:    'bg-amber-100 text-amber-700',
  terminated: 'bg-red-100 text-red-700',
};
const statusLabels: Record<string, string> = {
  draft: 'Taslak', sent: 'İnceleme Bekliyor', signed: 'İmzalandı',
  active: 'Aktif', expired: 'Süresi Doldu', terminated: 'Sonlandırıldı',
};

export default function PortalContractsPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['portal-contracts'],
    queryFn: () => portalApi.getContracts(),
  });

  const contracts = (data as any)?.data || [];

  const filtered = contracts.filter((c: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.contractNumber?.toLowerCase().includes(q);
  });

  const active = contracts.filter((c: any) => c.status === 'active' || c.status === 'signed');
  const expiring = active.filter((c: any) => {
    if (!c.endDate) return false;
    const days = Math.ceil((new Date(c.endDate).getTime() - Date.now()) / 86400000);
    return days >= 0 && days <= 60;
  });

  return (
    <>
      <PageHeader
        title="Sözleşmelerim"
        subtitle={`${contracts.length} sözleşme`}
      />

      {expiring.length > 0 && (
        <div className="mb-4 flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            {expiring.length} sözleşmenizin süresi 60 gün içinde doluyor.
            Yenileme için yetkili personelinizle iletişime geçiniz.
          </span>
        </div>
      )}

      <Card padding="none">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Sözleşme numarası ara..."
            className="max-w-sm"
          />
        </div>

        {isLoading ? (
          <SkeletonTable rows={4} cols={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Briefcase className="w-12 h-12" />}
            title="Sözleşme bulunamadı"
            description={search ? 'Arama kriterlerinizi değiştirin' : 'Kayıtlı sözleşme yok'}
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Sözleşme No</th>
                <th>Başlangıç</th>
                <th>Bitiş</th>
                <th>Tutar</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: any) => {
                const daysToEnd = c.endDate
                  ? Math.ceil((new Date(c.endDate).getTime() - Date.now()) / 86400000)
                  : null;
                const isNearExpiry = daysToEnd !== null && daysToEnd >= 0 && daysToEnd <= 60;
                const isExpired = daysToEnd !== null && daysToEnd < 0;

                return (
                  <tr key={c.id} className={isExpired ? 'bg-red-50/30 dark:bg-red-950/10' : isNearExpiry ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                          {c.contractNumber}
                        </span>
                        {c.autoRenew && (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 dark:bg-blue-950/30 px-1.5 py-0.5 rounded" title="Otomatik Yenileme">
                            <RefreshCw className="w-3 h-3" />
                            Oto
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="text-sm text-slate-500">{formatDate(c.startDate)}</span>
                    </td>
                    <td>
                      <div>
                        <span className={`text-sm font-semibold ${isExpired ? 'text-red-600' : isNearExpiry ? 'text-amber-600' : 'text-slate-700 dark:text-slate-300'}`}>
                          {formatDate(c.endDate)}
                        </span>
                        {daysToEnd !== null && (
                          <p className={`text-xs ${isExpired ? 'text-red-500' : isNearExpiry ? 'text-amber-500' : 'text-slate-400'}`}>
                            {isExpired
                              ? `${Math.abs(daysToEnd)} gün geçmiş`
                              : `${daysToEnd} gün kaldı`
                            }
                          </p>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {c.totalValue
                          ? formatCurrency(Number(c.totalValue), c.currency || 'TRY')
                          : '—'
                        }
                      </span>
                    </td>
                    <td>
                      <Badge color={statusColors[c.status] || ''} dot>
                        {statusLabels[c.status] || c.status}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {c.signedDocumentUrl && (
                          <a
                            href={c.signedDocumentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-950/30 text-slate-400 hover:text-green-600"
                            title="İmzalı Belge İndir"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                        {!c.signedDocumentUrl && c.documentUrl && (
                          <a
                            href={c.documentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
                            title="Belge Görüntüle"
                          >
                            <FileText className="w-4 h-4" />
                          </a>
                        )}
                      </div>
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
