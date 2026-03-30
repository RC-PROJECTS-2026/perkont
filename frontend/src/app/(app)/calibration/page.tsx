'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useMutationWithToast } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, SearchInput,
  SkeletonTable, EmptyState, Modal, Input, Tabs, StatCard,
} from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { Wrench, Plus, RefreshCw, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useForm } from 'react-hook-form';

const calApi = {
  list:    (p?: any) => apiClient.get('/calibration', { params: p }),
  create:  (d: any) => apiClient.post('/calibration', d),
  update:  (id: string, d: any) => apiClient.put(`/calibration/${id}`, d),
  expiring: (days?: number) => apiClient.get('/calibration/expiring', { params: { days } }),
};

export default function CalibrationPage() {
  const [tab, setTab]       = useState('active');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [uploadModal, setUploadModal] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['calibration', tab, search],
    queryFn: () => calApi.list({ status: tab === 'all' ? undefined : tab, search }),
  });
  const { data: expiringData } = useQuery({
    queryKey: ['calibration-expiring'],
    queryFn: () => calApi.expiring(30),
  });

  const instruments = (data as any)?.data?.data || [];
  const expiringItems = (expiringData as any)?.data || [];

  const totalCount = instruments.length;
  const expiringSoonCount = expiringItems.length;
  const expiredCount = instruments.filter((i: any) =>
    i.nextCalibrationDate && new Date(i.nextCalibrationDate) < new Date()
  ).length;

  const { register, handleSubmit, reset } = useForm<any>();

  const createMutation = useMutationWithToast(calApi.create, {
    successMessage: 'Ölçüm aleti eklendi',
    invalidateKeys: [['calibration'], ['calibration-expiring']],
    onSuccess: () => { setShowCreate(false); reset(); },
  });

  const uploadMutation = useMutationWithToast(
    ({ id, file }: any) => {
      const fd = new FormData(); fd.append('file', file);
      return apiClient.post(`/calibration/${id}/certificate`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    {
      successMessage: 'Kalibrasyon sertifikası yüklendi',
      invalidateKeys: [['calibration']],
      onSuccess: () => { setUploadModal(null); setSelectedFile(null); },
    },
  );

  const statusColors: Record<string, string> = {
    active:        'bg-green-100 text-green-700',
    expiring_soon: 'bg-amber-100 text-amber-700',
    expired:       'bg-red-100 text-red-700',
    retired:       'bg-slate-100 text-slate-400',
  };
  const statusLabels: Record<string, string> = {
    active: 'Aktif', expiring_soon: 'Yakında Dolacak', expired: 'Süresi Doldu', retired: 'Hizmet Dışı',
  };

  const tabs = [
    { key: 'active',        label: 'Aktif' },
    { key: 'expiring_soon', label: 'Süresi Yaklaşan' },
    { key: 'expired',       label: 'Süresi Dolmuş' },
    { key: 'all',           label: 'Tümü' },
  ];

  const filtered = instruments.filter((i: any) =>
    !search ||
    i.name?.toLowerCase().includes(search.toLowerCase()) ||
    i.inventoryCode?.toLowerCase().includes(search.toLowerCase()) ||
    i.serialNumber?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title="Kalibrasyon Takibi"
        subtitle="Ölçüm ve test ekipmanları — ISO/IEC 17020 Madde 6.2"
        actions={
          <>
            <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Ölçüm Aleti Ekle</Button>
          </>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Toplam Alet" value={totalCount}
          icon={<Wrench className="w-5 h-5 text-slate-600" />} color="bg-slate-50 dark:bg-slate-800" />
        <StatCard label="Süresi Yaklaşan" value={expiringSoonCount}
          icon={<AlertTriangle className="w-5 h-5 text-amber-600" />} color="bg-amber-50 dark:bg-amber-950/40" />
        <StatCard label="Süresi Dolmuş" value={expiredCount}
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />} color="bg-red-50 dark:bg-red-950/40" />
      </div>

      <div className="mb-4 flex items-center gap-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        <div className="ml-auto">
          <SearchInput value={search} onChange={setSearch} placeholder="Alet adı, kod veya seri no ara..." className="w-56" />
        </div>
      </div>

      <Card padding="none">
        {isLoading ? <SkeletonTable rows={6} cols={9} /> : filtered.length === 0 ? (
          <EmptyState
            icon={<Wrench className="w-12 h-12" />}
            title="Ölçüm aleti bulunamadı"
            action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>Ekle</Button>}
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Cihaz Adı</th>
                <th>Envanter Kodu</th>
                <th>Seri No</th>
                <th>Kalibrasyon Lab</th>
                <th>Son Kalibrasyon</th>
                <th>Sonraki Kalibrasyon</th>
                <th>Sertifika No</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inst: any) => {
                const nextCal = inst.nextCalibrationDate ? new Date(inst.nextCalibrationDate) : null;
                const daysLeft = nextCal ? Math.ceil((nextCal.getTime() - Date.now()) / 86400000) : null;
                const isOverdue = daysLeft !== null && daysLeft <= 0;
                const isUrgent = daysLeft !== null && daysLeft > 0 && daysLeft <= 30;

                return (
                  <tr key={inst.id}>
                    <td>
                      <div>
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{inst.name}</span>
                        {inst.brand && <span className="text-xs text-slate-400 block">{inst.brand} {inst.model || ''}</span>}
                      </div>
                    </td>
                    <td><span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">{inst.inventoryCode}</span></td>
                    <td><span className="font-mono text-xs text-slate-500">{inst.serialNumber || '—'}</span></td>
                    <td><span className="text-sm text-slate-600 dark:text-slate-400">{inst.calibrationLab || '—'}</span></td>
                    <td><span className="text-sm text-slate-500">{formatDate(inst.lastCalibrationDate)}</span></td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {(isOverdue || isUrgent) && (
                          <AlertTriangle className={`w-3.5 h-3.5 ${isOverdue ? 'text-red-500' : 'text-amber-500'}`} />
                        )}
                        <span className={`text-sm ${isOverdue ? 'text-red-600 font-semibold' : isUrgent ? 'text-amber-600 font-medium' : 'text-slate-500'}`}>
                          {formatDate(inst.nextCalibrationDate)}
                        </span>
                        {daysLeft !== null && (
                          <span className="text-xs text-slate-400">
                            ({isOverdue ? `${Math.abs(daysLeft)}g gecikmiş` : `${daysLeft}g`})
                          </span>
                        )}
                      </div>
                    </td>
                    <td><span className="text-xs text-slate-500">{inst.certificateNumber || '—'}</span></td>
                    <td>
                      <Badge color={statusColors[inst.status] || ''} dot>
                        {statusLabels[inst.status] || inst.status}
                      </Badge>
                    </td>
                    <td>
                      <button
                        onClick={() => setUploadModal(inst)}
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600"
                        title="Sertifika Yükle"
                      >
                        <Upload className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); reset(); }}
        title="Ölçüm Aleti Ekle"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowCreate(false); reset(); }}>İptal</Button>
            <Button loading={createMutation.isPending} onClick={handleSubmit((d) => createMutation.mutate(d))}>Kaydet</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Cihaz Adı" required placeholder="Tork Anahtarı" {...register('name', { required: true })} />
          <Input label="Envanter Kodu" required placeholder="ENS-001" {...register('inventoryCode', { required: true })} />
          <Input label="Seri Numarası" {...register('serialNumber')} />
          <Input label="Marka" {...register('brand')} />
          <Input label="Model" {...register('model')} />
          <Input label="Sertifika No" {...register('certificateNumber')} />
          <Input label="Kalibrasyon Laboratuvarı" className="col-span-2" {...register('calibrationLab')} />
          <Input label="Son Kalibrasyon Tarihi" type="date" {...register('lastCalibrationDate')} />
          <Input label="Sonraki Kalibrasyon Tarihi" type="date" {...register('nextCalibrationDate')} />
        </div>
      </Modal>

      {/* Certificate Upload Modal */}
      <Modal
        open={!!uploadModal}
        onClose={() => { setUploadModal(null); setSelectedFile(null); }}
        title={`Kalibrasyon Sertifikası — ${uploadModal?.inventoryCode}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUploadModal(null)}>İptal</Button>
            <Button
              loading={uploadMutation.isPending}
              disabled={!selectedFile}
              onClick={() => uploadMutation.mutate({ id: uploadModal?.id, file: selectedFile })}
            >
              Yükle
            </Button>
          </>
        }
      >
        <div
          className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-teal-400 transition-colors"
          onClick={() => document.getElementById('cert-upload')?.click()}
        >
          <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          {selectedFile ? (
            <p className="text-sm font-semibold text-teal-600">{selectedFile.name}</p>
          ) : (
            <p className="text-sm text-slate-500">PDF sertifikasını seçmek için tıklayın</p>
          )}
          <input
            id="cert-upload"
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
          />
        </div>
      </Modal>
    </>
  );
}
