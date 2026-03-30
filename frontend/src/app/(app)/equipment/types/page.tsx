'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { equipmentApi } from '@/lib/api';
import { PageHeader, Card, Button, Input, Modal, Badge } from '@/components/ui';

export default function EquipmentTypesPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', defaultPeriodMonths: 12, description: '' });
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['equipment-types'], queryFn: equipmentApi.listTypes });
  const types = (data as any)?.data || data || [];

  const createMutation = useMutation({
    mutationFn: (d: any) => equipmentApi.createType(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['equipment-types'] }); setShowCreate(false); toast.success('Ekipman tipi oluşturuldu'); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="Ekipman Tipleri" subtitle="Muayene kapsamındaki ekipman kategorileri">
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Yeni Tip</Button>
      </PageHeader>
      <Card>
        {isLoading ? <div className="animate-pulse h-40 bg-slate-100 dark:bg-slate-800 rounded" /> : (
          <table className="data-table">
            <thead><tr><th>Kod</th><th>Ad</th><th>Periyot (Ay)</th><th>Açıklama</th><th>Durum</th></tr></thead>
            <tbody>
              {types.map((t: any) => (
                <tr key={t.id}>
                  <td><span className="font-mono text-sm font-semibold">{t.code}</span></td>
                  <td>{t.name}</td>
                  <td>{t.defaultPeriodMonths}</td>
                  <td className="text-slate-500 text-sm">{t.description || '—'}</td>
                  <td><Badge color={t.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}>{t.isActive ? 'Aktif' : 'Pasif'}</Badge></td>
                </tr>
              ))}
              {types.length === 0 && <tr><td colSpan={5} className="text-center text-slate-500 py-8">Henüz ekipman tipi yok</td></tr>}
            </tbody>
          </table>
        )}
      </Card>
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Yeni Ekipman Tipi">
        <div className="space-y-4">
          <Input label="Kod" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="KIE" />
          <Input label="Ad" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Kaldırma İletme Ekipmanları" />
          <Input label="Varsayılan Periyot (Ay)" type="number" value={form.defaultPeriodMonths} onChange={(e) => setForm({ ...form, defaultPeriodMonths: +e.target.value })} />
          <Input label="Açıklama" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Button className="w-full" loading={createMutation.isPending} onClick={() => createMutation.mutate(form)}>Oluştur</Button>
        </div>
      </Modal>
    </div>
  );
}
