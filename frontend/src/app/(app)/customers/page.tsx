'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCustomers, useMutationWithToast, customersApi } from '@/lib/api';
import {
  PageHeader, Button, Card, SearchInput, Badge,
  SkeletonTable, EmptyState, Modal, Input, Select, Textarea,
} from '@/components/ui';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Plus, ExternalLink, MapPin, Phone, Mail, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

const createSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  taxNumber: z.string().optional(),
  taxOffice: z.string().optional(),
  city: z.string().optional(),
  sector: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});
type CreateForm = z.infer<typeof createSchema>;

export default function CustomersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, refetch } = useCustomers({ search, page, limit: 20 });
  const customers = (data as any)?.data?.data || [];
  const total = (data as any)?.data?.total || 0;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
  });

  const createMutation = useMutationWithToast(customersApi.create, {
    successMessage: 'Müşteri başarıyla oluşturuldu',
    invalidateKeys: [['customers']],
    onSuccess: () => { setShowCreate(false); reset(); },
  });

  return (
    <>
      <PageHeader
        title="Müşteriler"
        subtitle={`${total} kayıt`}
        actions={
          <>
            <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>
              Yenile
            </Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
              Yeni Müşteri
            </Button>
          </>
        }
      />

      <Card padding="none">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <SearchInput
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="İsim, kod, vergi no ara..."
            className="max-w-sm"
          />
        </div>

        {isLoading ? (
          <SkeletonTable rows={8} cols={6} />
        ) : customers.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-12 h-12" />}
            title="Müşteri bulunamadı"
            description="Arama kriterlerinizi değiştirin veya yeni müşteri ekleyin"
            action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Müşteri Ekle</Button>}
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Müşteri</th>
                <th>Kod</th>
                <th>Şehir</th>
                <th>İletişim</th>
                <th>Lokasyon</th>
                <th>LOGO</th>
                <th>Durum</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {customers.map((c: any) => (
                <tr key={c.id} className="cursor-pointer" onClick={() => router.push(`/customers/${c.id}`)}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-teal-100 dark:bg-teal-950/40 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-4 h-4 text-teal-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">{c.name}</p>
                        {c.taxNumber && <p className="text-xs text-slate-400">VN: {c.taxNumber}</p>}
                      </div>
                    </div>
                  </td>
                  <td><span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">{c.code}</span></td>
                  <td>
                    {c.city && (
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <MapPin className="w-3 h-3" />
                        <span className="text-sm">{c.city}</span>
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="space-y-0.5">
                      {c.contactName && <p className="text-xs text-slate-600 dark:text-slate-400">{c.contactName}</p>}
                      {c.contactPhone && (
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <Phone className="w-3 h-3" /> {c.contactPhone}
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      {c.locations?.length || 0}
                    </span>
                  </td>
                  <td>
                    {c.logoCariId ? (
                      <Badge color="bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400">
                        Eşlendi
                      </Badge>
                    ) : (
                      <Badge color="bg-slate-100 text-slate-500">Eşlenmedi</Badge>
                    )}
                  </td>
                  <td>
                    <Badge color={c.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'} dot>
                      {c.isActive ? 'Aktif' : 'Pasif'}
                    </Badge>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                      onClick={() => router.push(`/customers/${c.id}`)}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {total > 20 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-sm text-slate-500">{total} kayıttan {Math.min(page * 20, total)} gösteriliyor</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Önceki</Button>
              <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)}>Sonraki</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); reset(); }}
        title="Yeni Müşteri"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowCreate(false); reset(); }}>İptal</Button>
            <Button loading={createMutation.isPending} onClick={handleSubmit((d) => createMutation.mutate(d))}>
              Oluştur
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Müşteri Kodu" placeholder="ACME-001" error={errors.code?.message} required {...register('code')} />
          <Input label="Müşteri Adı" placeholder="Örnek A.Ş." error={errors.name?.message} required {...register('name')} />
          <Input label="Vergi No" placeholder="1234567890" {...register('taxNumber')} />
          <Input label="Vergi Dairesi" {...register('taxOffice')} />
          <Input label="Şehir" {...register('city')} />
          <Input label="Sektör" {...register('sector')} />
          <Input label="İletişim Kişisi" {...register('contactName')} />
          <Input label="Telefon" type="tel" {...register('contactPhone')} />
          <Input label="E-posta" type="email" error={errors.contactEmail?.message} {...register('contactEmail')} className="col-span-2" />
          <Textarea label="Adres" {...register('address')} className="col-span-2" />
          <Textarea label="Notlar" {...register('notes')} className="col-span-2" rows={2} />
        </div>
      </Modal>
    </>
  );
}
