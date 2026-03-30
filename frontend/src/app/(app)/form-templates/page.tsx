'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { formTemplatesApi, useEquipmentTypes, useMutationWithToast } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, SearchInput,
  SkeletonTable, EmptyState, Modal, Input, Select, Tabs,
} from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { Zap, Plus, RefreshCw, Upload, CheckCircle2, Eye, GitBranch } from 'lucide-react';
import toast from 'react-hot-toast';

export default function FormTemplatesPage() {
  const router = useRouter();
  const [tab, setTab] = useState('active');
  const [search, setSearch] = useState('');
  const [uploadModal, setUploadModal] = useState<any>(null);
  const [reviseModal, setReviseModal] = useState<any>(null);
  const [newRevision, setNewRevision] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ code: '', name: '', revision: 'Rev.01', equipmentTypeId: '', description: '' });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['form-templates', tab],
    queryFn: () => formTemplatesApi.list(),
  });
  const { data: typesData } = useEquipmentTypes();

  const allTemplates = (data as any)?.data || [];
  const types = (typesData as any)?.data || [];

  const filtered = allTemplates.filter((t: any) => {
    const matchSearch = !search || t.name?.toLowerCase().includes(search.toLowerCase()) || t.code?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = tab === 'all' || t.status === tab;
    return matchSearch && matchStatus;
  });

  const activateMutation = useMutationWithToast(formTemplatesApi.activate, {
    successMessage: 'Form aktif edildi',
    invalidateKeys: [['form-templates']],
  });

  const uploadMutation = useMutationWithToast(
    ({ id, file }: any) => formTemplatesApi.uploadTemplate(id, file),
    {
      successMessage: 'PDF şablon yüklendi',
      invalidateKeys: [['form-templates']],
      onSuccess: () => { setUploadModal(null); setSelectedFile(null); },
    },
  );

  const reviseMutation = useMutationWithToast(
    ({ id, revision }: any) => formTemplatesApi.createRevision(id, revision),
    {
      successMessage: 'Yeni revizyon oluşturuldu',
      invalidateKeys: [['form-templates']],
      onSuccess: () => { setReviseModal(null); setNewRevision(''); },
    },
  );

  const statusColors: Record<string, string> = {
    draft:      'bg-slate-100 text-slate-500',
    active:     'bg-green-100 text-green-700',
    superseded: 'bg-amber-100 text-amber-700',
    cancelled:  'bg-red-100 text-red-700',
  };
  const statusLabels: Record<string, string> = {
    draft: 'Taslak', active: 'Aktif', superseded: 'Yerini Aldı', cancelled: 'İptal',
  };

  const tabs = [
    { key: 'active',     label: 'Aktif' },
    { key: 'draft',      label: 'Taslak' },
    { key: 'superseded', label: 'Geçmiş' },
    { key: 'all',        label: 'Tümü' },
  ];

  return (
    <div>
      <PageHeader
        title="Form Şablonları"
        subtitle="Denetim formları ve PDF şablon yönetimi"
        actions={
          <>
            <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
              Yeni Form
            </Button>
          </>
        }
      />

      {/* Info banner */}
      <div className="mb-4 p-4 bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-xl text-sm text-teal-700 dark:text-teal-300">
        <strong>Önemli:</strong> Her ekipman tipi için yalnızca bir <strong>Aktif</strong> form şablonu bulunabilir.
        Yeni revizyon aktif edildiğinde eski form otomatik olarak "Geçmiş" durumuna geçer.
        Raporlar, oluşturulduğu andaki form revizyonuyla ilişkilendirilir.
      </div>

      <div className="mb-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      <Card padding="none">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <SearchInput value={search} onChange={setSearch} placeholder="Form adı veya kodu ara..." className="max-w-sm" />
        </div>

        {isLoading ? (
          <SkeletonTable rows={6} cols={7} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Zap className="w-12 h-12" />} title="Form şablonu bulunamadı" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Kod</th>
                <th>Form Adı</th>
                <th>Ekipman Tipi</th>
                <th>Revizyon</th>
                <th>Revizyon Tarihi</th>
                <th>PDF Şablon</th>
                <th>Alan Sayısı</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t: any) => (
                <tr key={t.id}>
                  <td>
                    <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">{t.code}</span>
                  </td>
                  <td>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.name}</span>
                  </td>
                  <td>
                    <span className="text-sm text-slate-500">{t.equipmentType?.name || '—'}</span>
                  </td>
                  <td>
                    <span className="text-xs font-bold bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 px-2 py-1 rounded font-mono">
                      {t.revision}
                    </span>
                  </td>
                  <td>
                    <span className="text-sm text-slate-500">{formatDate(t.revisionDate)}</span>
                  </td>
                  <td>
                    {t.outputTemplateUrl ? (
                      <Badge color="bg-green-100 text-green-700">Yüklendi</Badge>
                    ) : (
                      <Badge color="bg-red-100 text-red-700">Yüklenmedi</Badge>
                    )}
                  </td>
                  <td>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      {t.fields?.length || 0}
                    </span>
                  </td>
                  <td>
                    <Badge color={statusColors[t.status] || ''} dot>
                      {statusLabels[t.status] || t.status}
                    </Badge>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <button
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                        title="Detay"
                        onClick={() => router.push(`/form-templates/${t.id}/designer`)}
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {/* PDF Upload */}
                      {t.status !== 'active' || !t.outputTemplateUrl ? (
                        <button
                          onClick={() => setUploadModal(t)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600"
                          title="PDF Şablon Yükle"
                        >
                          <Upload className="w-4 h-4" />
                        </button>
                      ) : null}

                      {/* Activate */}
                      {t.status === 'draft' && t.outputTemplateUrl && (
                        <button
                          onClick={() => activateMutation.mutate(t.id)}
                          className="p-1.5 rounded-lg hover:bg-green-50 text-slate-400 hover:text-green-600"
                          title="Aktif Et"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}

                      {/* Revise */}
                      {t.status === 'active' && (
                        <button
                          onClick={() => setReviseModal(t)}
                          className="p-1.5 rounded-lg hover:bg-violet-50 text-slate-400 hover:text-violet-600"
                          title="Yeni Revizyon"
                        >
                          <GitBranch className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* PDF Upload Modal */}
      <Modal
        open={!!uploadModal}
        onClose={() => { setUploadModal(null); setSelectedFile(null); }}
        title={`PDF Şablon Yükle — ${uploadModal?.code}`}
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
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Firmaya ait orijinal PDF formunu yükleyin. Sistem, denetim verilerini bu formun üzerine koordinat bazlı işleyecektir.
          </p>
          <div
            className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-teal-400 transition-colors"
            onClick={() => document.getElementById('pdf-upload')?.click()}
          >
            <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            {selectedFile ? (
              <p className="text-sm font-semibold text-teal-600">{selectedFile.name}</p>
            ) : (
              <p className="text-sm text-slate-500">PDF dosyasını seçmek için tıklayın</p>
            )}
            <input
              id="pdf-upload"
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />
          </div>
        </div>
      </Modal>

      {/* Revise Modal */}
      <Modal
        open={!!reviseModal}
        onClose={() => { setReviseModal(null); setNewRevision(''); }}
        title={`Yeni Revizyon — ${reviseModal?.code}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReviseModal(null)}>İptal</Button>
            <Button
              loading={reviseMutation.isPending}
              disabled={!newRevision}
              onClick={() => reviseMutation.mutate({ id: reviseModal?.id, revision: newRevision })}
            >
              Revizyon Oluştur
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Mevcut <strong>{reviseModal?.revision}</strong> revizyonunun tüm alanları kopyalanarak yeni bir taslak oluşturulacaktır.
          </p>
          <Input
            label="Yeni Revizyon Numarası"
            value={newRevision}
            onChange={(e) => setNewRevision(e.target.value)}
            placeholder="Örn: Rev.06"
          />
        </div>
      </Modal>

      {/* Create Form Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Yeni Form Şablonu"
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Form Kodu"
            value={createForm.code}
            onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
            placeholder="FORM-KIE-001"
          />
          <Input
            label="Form Adı"
            value={createForm.name}
            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            placeholder="Kaldırma İletme Muayene Formu"
          />
          <Input
            label="Revizyon"
            value={createForm.revision}
            onChange={(e) => setCreateForm({ ...createForm, revision: e.target.value })}
            placeholder="Rev.01"
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Ekipman Tipi</label>
            <select
              value={createForm.equipmentTypeId}
              onChange={(e) => setCreateForm({ ...createForm, equipmentTypeId: e.target.value })}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm px-3 py-2 h-9"
            >
              <option value="">Seçiniz...</option>
              {types.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
              ))}
            </select>
          </div>
          <Input
            label="Açıklama"
            value={createForm.description}
            onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
            placeholder="Form açıklaması (opsiyonel)"
          />
          <Button
            className="w-full"
            disabled={!createForm.code || !createForm.name || !createForm.equipmentTypeId}
            onClick={async () => {
              try {
                await formTemplatesApi.create({ ...createForm, layoutConfig: {} });
                toast.success('Form şablonu oluşturuldu');
                setShowCreate(false);
                setCreateForm({ code: '', name: '', revision: 'Rev.01', equipmentTypeId: '', description: '' });
                refetch();
              } catch (err: any) {
                toast.error(err.message || 'Oluşturulamadı');
              }
            }}
          >
            Oluştur
          </Button>
        </div>
      </Modal>
    </div>
  );
}
