'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useMutationWithToast } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, EmptyState, Modal, Input, Textarea,
} from '@/components/ui';
import { MapPin, Plus, Building2, Phone, ArrowLeft, Edit2 } from 'lucide-react';
import { useForm } from 'react-hook-form';

export default function CustomerLocationsPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem]     = useState<any>(null);

  const { data: custData } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => apiClient.get(`/customers/${id}`),
    enabled: !!id,
  });
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['locations', id],
    queryFn: () => apiClient.get(`/customers/${id}/locations`),
    enabled: !!id,
  });

  const customer  = (custData as any)?.data;
  const locations = (data as any)?.data || [];

  const { register, handleSubmit, reset, setValue } = useForm<any>();

  const createMutation = useMutationWithToast(
    (d: any) => apiClient.post(`/customers/${id}/locations`, d),
    { successMessage: 'Lokasyon eklendi', invalidateKeys: [['locations', id]], onSuccess: () => { setShowCreate(false); reset(); } },
  );
  const updateMutation = useMutationWithToast(
    (d: any) => apiClient.put(`/customers/locations/${editItem?.id}`, d),
    { successMessage: 'Güncellendi', invalidateKeys: [['locations', id]], onSuccess: () => { setEditItem(null); reset(); } },
  );

  const openEdit = (loc: any) => {
    setEditItem(loc);
    ['name', 'address', 'city', 'district', 'contactName', 'contactPhone', 'notes'].forEach((k) => setValue(k, loc[k] || ''));
  };

  return (
    <>
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> {customer?.name || 'Müşteri'}
      </button>

      <PageHeader
        title="Lokasyonlar"
        subtitle={`${customer?.name || ''} — ${locations.length} lokasyon`}
        actions={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Lokasyon Ekle</Button>}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-36 skeleton rounded-xl" />)}
        </div>
      ) : locations.length === 0 ? (
        <Card><EmptyState icon={<MapPin className="w-12 h-12" />} title="Lokasyon eklenmemiş"
          action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Ekle</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {locations.map((loc: any) => (
            <Card key={loc.id} hover>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/40 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-teal-600" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-slate-800 dark:text-slate-200">{loc.name}</p>
                    <Badge color={loc.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'} dot>
                      {loc.isActive ? 'Aktif' : 'Pasif'}
                    </Badge>
                  </div>
                </div>
                <button onClick={() => openEdit(loc)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1.5 text-sm text-slate-500">
                {loc.address && <div className="flex items-start gap-2"><MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /><span className="line-clamp-2">{loc.address}{loc.district ? `, ${loc.district}` : ''}{loc.city ? ` / ${loc.city}` : ''}</span></div>}
                {loc.contactName && <p><span className="text-slate-400">İrtibat:</span> {loc.contactName}</p>}
                {loc.contactPhone && <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /><span className="font-mono text-xs">{loc.contactPhone}</span></div>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {[showCreate, !!editItem].map((open, idx) => {
        const isCreate = idx === 0;
        return (
          <Modal
            key={idx}
            open={open}
            onClose={() => isCreate ? (setShowCreate(false), reset()) : (setEditItem(null), reset())}
            title={isCreate ? 'Yeni Lokasyon' : `Düzenle — ${editItem?.name}`}
            size="md"
            footer={
              <>
                <Button variant="secondary" onClick={() => isCreate ? (setShowCreate(false), reset()) : (setEditItem(null), reset())}>İptal</Button>
                <Button
                  loading={isCreate ? createMutation.isPending : updateMutation.isPending}
                  onClick={handleSubmit((d) => isCreate ? createMutation.mutate(d) : updateMutation.mutate(d))}
                >
                  {isCreate ? 'Ekle' : 'Kaydet'}
                </Button>
              </>
            }
          >
            <div className="grid grid-cols-2 gap-4">
              <Input label="Lokasyon Adı" required className="col-span-2" {...register('name', { required: true })} />
              <Input label="Adres" className="col-span-2" {...register('address')} />
              <Input label="İlçe" {...register('district')} />
              <Input label="Şehir" {...register('city')} />
              <Input label="İrtibat Kişisi" {...register('contactName')} />
              <Input label="İrtibat Telefonu" {...register('contactPhone')} />
              <Textarea label="Notlar" {...register('notes')} className="col-span-2" rows={2} />
            </div>
          </Modal>
        );
      })}
    </>
  );
}
