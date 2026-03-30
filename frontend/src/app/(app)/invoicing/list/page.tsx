'use client';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { PageHeader, Card, Badge, Button, SearchInput, SkeletonTable, EmptyState } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { CreditCard, RefreshCw, ExternalLink } from 'lucide-react';
import { useState } from 'react';

const statusColors: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-700',
  success:   'bg-green-100 text-green-700',
  failed:    'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
};
const statusLabels: Record<string, string> = {
  pending: 'Bekliyor', success: 'Başarılı', failed: 'Hatalı', cancelled: 'İptal',
};

export default function InvoiceListPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['logo-invoices'],
    queryFn: () => apiClient.get('/logo/invoices?limit=100'),
  });

  const invoices = ((data as any)?.data?.data || (data as any)?.data || []).filter((inv: any) =>
    !search || inv.logoInvoiceNo?.toLowerCase().includes(search.toLowerCase()),
  );

  const totalAmount = invoices
    .filter((i: any) => i.status === 'success')
    .reduce((sum: number, i: any) => sum + (Number(i.amount) || 0), 0);

  return (
    <>
      <PageHeader
        title="Fatura Listesi"
        subtitle="LOGO ERP'ye gönderilen faturalar"
        actions={
          <div className="flex items-center gap-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Fatura no ara..." className="w-48" />
            <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
          </div>
        }
      />

      {totalAmount > 0 && (
        <div className="mb-4 p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm text-emerald-700 dark:text-emerald-300">
          Başarılı faturaların toplam tutarı: <strong>₺{totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</strong>
        </div>
      )}

      <Card padding="none">
        {isLoading ? <SkeletonTable rows={6} cols={6} /> : invoices.length === 0 ? (
          <EmptyState icon={<CreditCard className="w-12 h-12" />} title="Fatura bulunamadı" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>LOGO Fatura No</th>
                <th>İş Emri</th>
                <th>Tutar</th>
                <th>Fatura Tarihi</th>
                <th>LOGO ID</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv: any) => (
                <tr key={inv.id}>
                  <td>
                    <span className="font-mono text-sm font-semibold">{inv.logoInvoiceNo || '—'}</span>
                  </td>
                  <td>
                    <span className="font-mono text-xs text-slate-400">{inv.workOrderId?.slice(0, 8)}…</span>
                  </td>
                  <td>
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {inv.amount ? `₺${Number(inv.amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '—'}
                    </span>
                  </td>
                  <td><span className="text-sm text-slate-500">{formatDate(inv.invoiceDate)}</span></td>
                  <td><span className="font-mono text-xs text-slate-400">{inv.logoInvoiceId || '—'}</span></td>
                  <td><Badge color={statusColors[inv.status] || ''} dot>{statusLabels[inv.status] || inv.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
