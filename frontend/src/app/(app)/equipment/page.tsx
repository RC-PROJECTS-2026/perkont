'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEquipment, useEquipmentTypes, equipmentApi, useMutationWithToast } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, SearchInput, Select,
  SkeletonTable, EmptyState, Modal, Input, StatCard,
} from '@/components/ui';
import { formatDate, isExpiringSoon } from '@/lib/utils';
import { Package, Plus, RefreshCw, QrCode, AlertCircle, Calendar, Eye } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

export default function EquipmentPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, refetch } = useEquipment({
    search, equipmentTypeId: typeFilter || undefined,
    status: statusFilter || undefined, page, limit: 20,
  });
  const { data: typesData } = useEquipmentTypes();

  const equipment = (data as any)?.data?.data || [];
  const total = (data as any)?.data?.total || 0;
  const types = (typesData as any)?.data || [];

  const { register, handleSubmit, reset, formState: { errors } } = useForm<any>();

  const createMutation = useMutationWithToast(equipmentApi.create, {
    successMessage: 'Ekipman başarıyla oluşturuldu',
    invalidateKeys: [['equipment']],
    onSuccess: () => { setShowCreate(false); reset(); },
  });

  const downloadQr = async (id: string, code: string) => {
    try {
      const blob = await equipmentApi.getQrLabel(id);
      const url = URL.createObjectURL(blob as any);
      const a = document.createElement('a'); a.href = url;
      a.download = `qr-${code}.png`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('QR etiket indirilemedi'); }
  };

  const typeOptions = [
    { value: '', label: 'Tüm Tipler' },
    ...types.map((t: any) => ({ value: t.id, label: t.name })),
  ];

  return (
    <>
      <PageHeader
        title="Ekipman Envanteri"
        subtitle={`${total} ekipman`}
        actions={
          <>
            <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Ekipman Ekle</Button>
          </>
        }
      />

      <Card padding="none">
        {/* Filters */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap gap-3">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Envanter kodu, seri no, marka ara..." className="w-72" />
          <Select
            options={typeOptions}
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="w-44"
          />
          <Select
            options={[
              { value: '', label: 'Tüm Durumlar' },
              { value: 'active', label: 'Aktif' },
              { value: 'passive', label: 'Pasif' },
              { value: 'under_repair', label: 'Tamirde' },
              { value: 'scrapped', label: 'Hurdaya Ayrıldı' },
            ]}
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="w-44"
          />
        </div>

        {isLoading ? (
          <SkeletonTable rows={8} cols={7} />
        ) : equipment.length === 0 ? (
          <EmptyState
            icon={<Package className="w-12 h-12" />}
            title="Ekipman bulunamadı"
            action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Ekipman Ekle</Button>}
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Envanter Kodu</th>
                <th>Tip</th>
                <th>Müşteri / Lokasyon</th>
                <th>Marka / Model</th>
                <th>Kapasite</th>
                <th>Son Kontrol</th>
                <th>Sonraki Kontrol</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {equipment.map((eq: any) => {
                const nextControl = eq.nextControlDate ? new Date(eq.nextControlDate) : null;
                const daysLeft = nextControl
                  ? Math.ceil((nextControl.getTime() - Date.now()) / 86400000)
                  : null;
                const isOverdue = daysLeft !== null && daysLeft < 0;
                const isUrgent = daysLeft !== null && daysLeft >= 0 && daysLeft <= 14;

                const statusColors: Record<string, string> = {
                  active:       'bg-green-100 text-green-700',
                  passive:      'bg-slate-100 text-slate-500',
                  under_repair: 'bg-amber-100 text-amber-700',
                  scrapped:     'bg-red-100 text-red-700',
                };
                const statusLabels: Record<string, string> = {
                  active: 'Aktif', passive: 'Pasif',
                  under_repair: 'Tamirde', scrapped: 'Hurda',
                };

                return (
                  <tr key={eq.id} className="cursor-pointer" onClick={() => router.push(`/equipment/${eq.id}`)}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                          <Package className="w-4 h-4 text-slate-500" />
                        </div>
                        <div>
                          <p className="text-xs font-bold font-mono text-slate-800 dark:text-slate-200">{eq.inventoryCode}</p>
                          <p className="text-xs text-slate-400">{eq.qrCode}</p>
                        </div>
                      </div>
                    </td>
                    <td><span className="text-sm text-slate-600 dark:text-slate-400">{eq.equipmentType?.name}</span></td>
                    <td>
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{eq.customer?.name}</p>
                        {eq.location?.name && (
                          <p className="text-xs text-slate-400">{eq.location.name}</p>
                        )}
                      </div>
                    </td>
                    <td>
                      <div>
                        <p className="text-sm text-slate-600 dark:text-slate-400">{eq.brand || '—'}</p>
                        {eq.model && <p className="text-xs text-slate-400">{eq.model}</p>}
                      </div>
                    </td>
                    <td>
                      <span className="text-sm text-slate-600 dark:text-slate-400">{eq.capacity || '—'}</span>
                    </td>
                    <td>
                      <span className="text-sm text-slate-500">{formatDate(eq.lastControlDate)}</span>
                    </td>
                    <td>
                      {nextControl ? (
                        <div className="flex items-center gap-1.5">
                          {(isOverdue || isUrgent) && (
                            <AlertCircle className={`w-3.5 h-3.5 ${isOverdue ? 'text-red-500' : 'text-amber-500'}`} />
                          )}
                          <span className={`text-sm font-medium ${isOverdue ? 'text-red-600' : isUrgent ? 'text-amber-600' : 'text-slate-600 dark:text-slate-400'}`}>
                            {formatDate(eq.nextControlDate)}
                          </span>
                          {daysLeft !== null && (
                            <span className={`text-xs ${isOverdue ? 'text-red-500' : isUrgent ? 'text-amber-500' : 'text-slate-400'}`}>
                              ({isOverdue ? `${Math.abs(daysLeft)}g gecikmiş` : `${daysLeft}g`})
                            </span>
                          )}
                        </div>
                      ) : <span className="text-slate-300 text-sm">—</span>}
                    </td>
                    <td>
                      <Badge color={statusColors[eq.status] || ''} dot>
                        {statusLabels[eq.status] || eq.status}
                      </Badge>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => router.push(`/equipment/${eq.id}`)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                          title="Detay"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => downloadQr(eq.id, eq.inventoryCode)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                          title="QR Etiket"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {total > 20 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-sm text-slate-500">{total} ekipmandan {Math.min(page * 20, total)} gösteriliyor</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Önceki</Button>
              <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)}>Sonraki</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create Equipment Modal */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); reset(); }}
        title="Yeni Ekipman Tanımla"
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowCreate(false); reset(); }}>İptal</Button>
            <Button loading={createMutation.isPending} onClick={handleSubmit((d) => createMutation.mutate(d))}>
              Kaydet
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Ekipman Tipi"
            options={types.map((t: any) => ({ value: t.id, label: t.name }))}
            placeholder="Seçiniz..."
            required
            {...register('equipmentTypeId', { required: true })}
          />
          <Input label="Envanter Kodu" placeholder="EKP-2024-0001" required {...register('inventoryCode', { required: true })} />
          <Input label="Seri Numarası" {...register('serialNumber')} />
          <Input label="Marka" {...register('brand')} />
          <Input label="Model" {...register('model')} />
          <Input label="Üretim Yılı" type="number" min={1950} max={2030} {...register('manufactureYear', { valueAsNumber: true })} />
          <Input label="Kapasite" placeholder="ör: 5 ton" {...register('capacity')} />
          <Input label="Kapasite Birimi" placeholder="ton, bar, kW..." {...register('capacityUnit')} />
          <Input label="İlk Kullanım Tarihi" type="date" {...register('firstUseDate')} />
          <Input label="Kontrol Periyodu (ay)" type="number" min={1} max={120} {...register('controlPeriodMonths', { valueAsNumber: true })} />
          <Input label="Kurulum Yeri" placeholder="3. Kat Makine Dairesi" className="col-span-2" {...register('installationLocation')} />
          <p className="col-span-2 text-xs text-slate-400">* Müşteri ID ve Lokasyon ID, ekipman detay sayfasından güncellenebilir</p>
        </div>
      </Modal>
    </>
  );
}
