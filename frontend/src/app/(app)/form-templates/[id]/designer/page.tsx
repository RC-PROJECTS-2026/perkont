'use client';
import { useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { formTemplatesApi, useMutationWithToast } from '@/lib/api';
import { Card, Badge, Button, Input, Select, Modal, Textarea } from '@/components/ui';
import {
  GripVertical, Plus, Trash2, ChevronUp, ChevronDown,
  Eye, EyeOff, Save, ArrowLeft, Settings,
  Hash, Type, ToggleLeft, List, Calendar, Camera,
  Pen, Image as ImageIcon, Table, FileCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';

/* ─── Tipler ──────────────────────────────────────────────────────────────── */
type FieldType =
  | 'text' | 'textarea' | 'number' | 'boolean' | 'select'
  | 'check_item' | 'check_matrix' | 'date' | 'photo' | 'signature'
  | 'section_header' | 'calculated';

interface PdfCoordinate {
  page: number; x: number; y: number;
  width: number; height: number; fontSize: number;
}

interface ValidationRule {
  min?: number; max?: number; regex?: string;
}

interface ConditionalLogic {
  fieldKey: string; operator: string; value: string;
}

interface FormField {
  id:            string;
  fieldKey:      string;
  label:         string;
  fieldType:     FieldType;
  section:       string;
  isRequired:    boolean;
  unit?:         string;
  placeholder?:  string;
  defaultValue?: string;
  hint?:         string;
  options?:      Array<{ value: string; label: string }>;
  checkItems?:   Array<{ id: string; label: string }>;
  pdfCoordinate?: PdfCoordinate;
  validation?:   ValidationRule;
  conditional?:  ConditionalLogic;
}

/* ─── Sabitler ────────────────────────────────────────────────────────────── */
const FIELD_TYPE_ICONS: Record<FieldType, React.ReactNode> = {
  text:           <Type className="w-4 h-4" />,
  textarea:       <Type className="w-4 h-4" />,
  number:         <Hash className="w-4 h-4" />,
  boolean:        <ToggleLeft className="w-4 h-4" />,
  select:         <List className="w-4 h-4" />,
  check_item:     <FileCheck className="w-4 h-4" />,
  check_matrix:   <Table className="w-4 h-4" />,
  date:           <Calendar className="w-4 h-4" />,
  photo:          <Camera className="w-4 h-4" />,
  signature:      <Pen className="w-4 h-4" />,
  section_header: <Type className="w-4 h-4" />,
  calculated:     <Hash className="w-4 h-4" />,
};

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text:           'Metin',
  textarea:       'Uzun Metin',
  number:         'Sayı',
  boolean:        'Evet / Hayır',
  select:         'Seçim Listesi',
  check_item:     'Kontrol Maddesi',
  check_matrix:   'Kontrol Matrisi',
  date:           'Tarih',
  photo:          'Fotoğraf',
  signature:      'İmza',
  section_header: 'Bölüm Başlığı',
  calculated:     'Hesaplanan',
};

const PALETTE_TYPES: FieldType[] = [
  'text', 'textarea', 'number', 'date', 'boolean',
  'select', 'check_item', 'check_matrix', 'photo', 'signature',
];

const statusColors: Record<string, string> = {
  draft:      'bg-slate-100 text-slate-500',
  active:     'bg-green-100 text-green-700',
  superseded: 'bg-amber-100 text-amber-700',
};
const statusLabels: Record<string, string> = {
  draft: 'Taslak', active: 'Aktif', superseded: 'Geçmiş',
};

/* ─── Yardımcılar ─────────────────────────────────────────────────────────── */
const turkishToAscii = (s: string) =>
  s.replace(/[ğüşıöçĞÜŞİÖÇ]/g, (c) =>
    ({ ğ:'g',ü:'u',ş:'s',ı:'i',ö:'o',ç:'c',Ğ:'G',Ü:'U',Ş:'S',İ:'I',Ö:'O',Ç:'C' }[c] || c));

const generateFieldKey = (label: string) =>
  turkishToAscii(label).toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

/* ─── Sayfa ───────────────────────────────────────────────────────────────── */
export default function FormDesignerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [fields, setFields]               = useState<FormField[]>([]);
  const [selected, setSelected]           = useState<string | null>(null);
  const [templateName, setTemplateName]   = useState('');
  const [hasChanges, setHasChanges]       = useState(false);
  const [previewMode, setPreviewMode]     = useState(false);
  const [showAddModal, setShowAddModal]   = useState(false);

  // Yeni alan modal state
  const [newFieldType, setNewFieldType]       = useState<FieldType>('text');
  const [newFieldLabel, setNewFieldLabel]     = useState('');
  const [newFieldSection, setNewFieldSection] = useState('Genel');
  const [newFieldRequired, setNewFieldRequired] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ['form-template-designer', id],
    queryFn: () => formTemplatesApi.get(id),
    enabled: !!id,
    onSuccess: (res: any) => {
      const tmpl = res?.data;
      if (tmpl) {
        setTemplateName(tmpl.name);
        setFields(tmpl.fields || []);
      }
    },
  } as any);

  const template = (data as any)?.data;

  /* Kaydetme */
  const saveMutation = useMutationWithToast(
    (fieldsData: any) => {
      // Her bir alanı güncelle
      const promises = fieldsData.map((f: any, i: number) =>
        formTemplatesApi.updateField(id, f.id, { ...f, orderIndex: i }),
      );
      return Promise.all(promises);
    },
    {
      successMessage: 'Form kaydedildi',
      invalidateKeys: [['form-templates'], ['form-template-designer']],
      onSuccess: () => setHasChanges(false),
    },
  );

  /* Alan ekleme */
  const addField = useCallback((type: FieldType, label?: string, section?: string, required?: boolean) => {
    const fieldLabel = label || FIELD_TYPE_LABELS[type];
    const newField: FormField = {
      id:         `field_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      fieldKey:   generateFieldKey(fieldLabel),
      label:      fieldLabel,
      fieldType:  type,
      section:    section || 'Genel',
      isRequired: required ?? (type !== 'section_header'),
    };
    setFields((prev) => [...prev, newField]);
    setSelected(newField.id);
    setHasChanges(true);
  }, []);

  const addFieldFromModal = () => {
    if (!newFieldLabel.trim()) {
      toast.error('Etiket alanı zorunludur');
      return;
    }
    addField(newFieldType, newFieldLabel.trim(), newFieldSection.trim() || 'Genel', newFieldRequired);
    setShowAddModal(false);
    setNewFieldLabel('');
    setNewFieldSection('Genel');
    setNewFieldRequired(true);
    setNewFieldType('text');
  };

  /* Alan güncelleme */
  const updateField = useCallback((fieldId: string, updates: Partial<FormField>) => {
    setFields((prev) => prev.map((f) => f.id === fieldId ? { ...f, ...updates } : f));
    setHasChanges(true);
  }, []);

  /* Alan silme */
  const removeField = useCallback((fieldId: string) => {
    setFields((prev) => prev.filter((f) => f.id !== fieldId));
    if (selected === fieldId) setSelected(null);
    setHasChanges(true);
  }, [selected]);

  /* Alan sıralama */
  const moveField = useCallback((index: number, direction: 'up' | 'down') => {
    const next = direction === 'up' ? index - 1 : index + 1;
    if (next < 0 || next >= fields.length) return;
    const updated = [...fields];
    [updated[index], updated[next]] = [updated[next], updated[index]];
    setFields(updated);
    setHasChanges(true);
  }, [fields]);

  const selectedField = fields.find((f) => f.id === selected);

  /* Bölümler */
  const sections = useMemo(() => {
    const s = new Set(fields.map((f) => f.section));
    return Array.from(s);
  }, [fields]);

  /* Bölümlere göre gruplanmış alanlar */
  const fieldsBySection = useMemo(() => {
    const map: Record<string, FormField[]> = {};
    fields.forEach((f) => {
      if (!map[f.section]) map[f.section] = [];
      map[f.section].push(f);
    });
    return map;
  }, [fields]);

  /* ─── Önizleme modu ─────────────────────────────────────────────────────── */
  if (previewMode) {
    return (
      <>
        <div className="flex items-center gap-3 mb-6">
          <Button variant="outline" icon={<EyeOff className="w-4 h-4" />} onClick={() => setPreviewMode(false)}>
            Tasarıma Dön
          </Button>
          <h1 className="font-display font-bold text-xl text-slate-900 dark:text-slate-100">
            Önizleme — {templateName}
          </h1>
        </div>

        <div className="max-w-2xl mx-auto">
          <Card>
            <h2 className="font-bold text-lg text-slate-800 dark:text-slate-200 mb-6">{templateName}</h2>

            {Object.entries(fieldsBySection).map(([section, sectionFields]) => (
              <div key={section} className="mb-6">
                <h3 className="font-bold text-sm text-teal-600 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 pb-2 mb-4">
                  {section}
                </h3>
                <div className="space-y-4">
                  {sectionFields.map((field) => {
                    if (field.fieldType === 'section_header') return null;
                    return (
                      <div key={field.id}>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          {field.label}
                          {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                          {field.unit && <span className="text-slate-400 font-normal ml-1">({field.unit})</span>}
                        </label>

                        {field.fieldType === 'text' && (
                          <input type="text" disabled placeholder={field.placeholder || ''} defaultValue={field.defaultValue || ''}
                            className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800" />
                        )}
                        {field.fieldType === 'textarea' && (
                          <textarea disabled placeholder={field.placeholder || ''} defaultValue={field.defaultValue || ''} rows={3}
                            className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800" />
                        )}
                        {field.fieldType === 'number' && (
                          <input type="number" disabled placeholder={field.placeholder || ''} defaultValue={field.defaultValue || ''}
                            className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800" />
                        )}
                        {field.fieldType === 'date' && (
                          <input type="date" disabled
                            className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800" />
                        )}
                        {field.fieldType === 'boolean' && (
                          <div className="flex gap-4">
                            <label className="flex items-center gap-2"><input type="radio" disabled name={field.fieldKey} /> <span className="text-sm">Evet</span></label>
                            <label className="flex items-center gap-2"><input type="radio" disabled name={field.fieldKey} /> <span className="text-sm">Hayır</span></label>
                          </div>
                        )}
                        {field.fieldType === 'select' && (
                          <select disabled className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800">
                            <option value="">Seçiniz</option>
                            {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        )}
                        {field.fieldType === 'check_item' && (
                          <div className="flex items-center gap-2">
                            <input type="checkbox" disabled className="w-4 h-4 rounded" />
                            <span className="text-sm text-slate-500">Kontrol edildi</span>
                          </div>
                        )}
                        {field.fieldType === 'check_matrix' && (
                          <div className="text-xs text-slate-400 italic p-3 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg">Kontrol matrisi (mobil cihazda gösterilecek)</div>
                        )}
                        {field.fieldType === 'photo' && (
                          <div className="w-full h-24 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg flex items-center justify-center">
                            <Camera className="w-6 h-6 text-slate-300" />
                          </div>
                        )}
                        {field.fieldType === 'signature' && (
                          <div className="w-full h-20 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg flex items-center justify-center">
                            <Pen className="w-6 h-6 text-slate-300" />
                          </div>
                        )}

                        {field.hint && (
                          <p className="text-xs text-slate-400 mt-1">{field.hint}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </Card>
        </div>
      </>
    );
  }

  /* ─── Tasarım modu ──────────────────────────────────────────────────────── */
  return (
    <>
      {/* Üst bar */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="font-display font-bold text-xl text-slate-900 dark:text-slate-100">
            Form Tasarımcısı — {templateName}
          </h1>
          {template && (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm text-slate-400 font-mono">{template.code}</span>
              <span className="text-xs bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 px-2 py-0.5 rounded font-mono font-bold">
                {template.revision}
              </span>
              <Badge color={statusColors[template.status] || ''} dot>
                {statusLabels[template.status] || template.status}
              </Badge>
              <span className="text-sm text-slate-400">{fields.length} alan</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {hasChanges && <Badge color="bg-amber-100 text-amber-700">Kaydedilmemiş</Badge>}
          <Button variant="outline" icon={<Plus className="w-4 h-4" />} onClick={() => setShowAddModal(true)}>
            Alan Ekle
          </Button>
          <Button variant="outline" icon={<Eye className="w-4 h-4" />} onClick={() => setPreviewMode(true)}>
            Önizle
          </Button>
          <Button
            icon={<Save className="w-4 h-4" />}
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate(fields.map((f, i) => ({ ...f, orderIndex: i })))}
            disabled={!hasChanges}
          >
            Kaydet
          </Button>
        </div>
      </div>

      <div className="flex gap-6 h-[calc(100vh-200px)]">
        {/* ─── Sol Panel: Alan Paleti ─────────────────────────────────────── */}
        <div className="w-52 flex-shrink-0">
          <Card className="h-full overflow-y-auto">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Alan Tipleri</p>
            <div className="space-y-1.5">
              {/* Bölüm başlığı */}
              <button
                onClick={() => addField('section_header')}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-950/30 text-slate-600 dark:text-slate-400 hover:text-teal-600 text-sm font-medium transition-colors group border border-transparent hover:border-teal-200 dark:hover:border-teal-800"
              >
                <span className="text-slate-400 group-hover:text-teal-500">{FIELD_TYPE_ICONS.section_header}</span>
                Bölüm Başlığı
              </button>

              <div className="border-t border-slate-100 dark:border-slate-800 my-2" />

              {PALETTE_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => addField(type)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-950/30 text-slate-600 dark:text-slate-400 hover:text-teal-600 text-sm font-medium transition-colors group border border-transparent hover:border-teal-200 dark:hover:border-teal-800"
                >
                  <span className="text-slate-400 group-hover:text-teal-500">{FIELD_TYPE_ICONS[type]}</span>
                  {FIELD_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* ─── Orta Panel: Form Alanları ──────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <Card className="min-h-full" padding="none">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                {fields.length === 0 ? 'Sol panelden alan türü ekleyin' : `${fields.length} alan · ${sections.length} bölüm`}
              </p>
              <Button variant="ghost" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowAddModal(true)}>
                Yeni Bölüm
              </Button>
            </div>

            <div className="p-4 space-y-2">
              {fields.map((field, idx) => (
                <div
                  key={field.id}
                  onClick={() => setSelected(field.id)}
                  className={`
                    group flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all
                    ${selected === field.id
                      ? 'border-teal-400 bg-teal-50 dark:bg-teal-950/30'
                      : field.fieldType === 'section_header'
                      ? 'border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/10'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }
                  `}
                >
                  <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0 cursor-grab" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">{FIELD_TYPE_ICONS[field.fieldType]}</span>
                      {field.fieldType === 'section_header' ? (
                        <span className="font-bold text-sm text-teal-600 uppercase tracking-wider">{field.label}</span>
                      ) : (
                        <>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{field.label}</span>
                          {field.isRequired && <span className="text-red-400 text-xs">*</span>}
                          {field.unit && <span className="text-xs text-slate-400">({field.unit})</span>}
                          <span className="text-xs text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {FIELD_TYPE_LABELS[field.fieldType]}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-slate-400 font-mono">{field.fieldKey}</p>
                      <span className="text-xs text-slate-300">{field.section}</span>
                      {field.conditional && (
                        <span className="text-xs text-violet-500 bg-violet-50 dark:bg-violet-950/30 px-1.5 py-0.5 rounded">koşullu</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); moveField(idx, 'up'); }}
                      className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                      disabled={idx === 0}
                      title="Yukarı Taşı"
                    >
                      <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveField(idx, 'down'); }}
                      className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                      disabled={idx === fields.length - 1}
                      title="Aşağı Taşı"
                    >
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeField(field.id); }}
                      className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30"
                      title="Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                </div>
              ))}

              {fields.length === 0 && (
                <div className="py-16 text-center text-slate-300 dark:text-slate-600">
                  <Plus className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Soldaki panelden alan ekleyin veya</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowAddModal(true)}>
                    Alan Ekle
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ─── Sağ Panel: Alan Özellikleri ────────────────────────────────── */}
        <div className="w-80 flex-shrink-0">
          <Card className="h-full overflow-y-auto">
            {selectedField ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <Settings className="w-4 h-4 text-teal-600" />
                  <span className="font-bold text-sm text-slate-800 dark:text-slate-200">Alan Özellikleri</span>
                  <span className="text-xs text-slate-400 ml-auto">{FIELD_TYPE_LABELS[selectedField.fieldType]}</span>
                </div>

                <div className="space-y-3">
                  {/* Etiket */}
                  <FieldInput
                    label="Etiket"
                    value={selectedField.label}
                    onChange={(v) => updateField(selectedField.id, {
                      label: v,
                      fieldKey: generateFieldKey(v),
                    })}
                  />

                  {/* Alan Anahtarı */}
                  <FieldInput
                    label="Alan Anahtarı (key)"
                    value={selectedField.fieldKey}
                    onChange={(v) => updateField(selectedField.id, { fieldKey: v })}
                    mono
                    hint="Otomatik oluşturulur, düzenlenebilir"
                  />

                  {/* Tip (salt okunur) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Tip</label>
                    <div className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500">
                      {FIELD_TYPE_ICONS[selectedField.fieldType]}
                      {FIELD_TYPE_LABELS[selectedField.fieldType]}
                    </div>
                  </div>

                  {/* Bölüm */}
                  <FieldInput
                    label="Bölüm"
                    value={selectedField.section}
                    onChange={(v) => updateField(selectedField.id, { section: v })}
                    placeholder="Genel, Kontrol Maddeleri..."
                  />

                  {selectedField.fieldType !== 'section_header' && (
                    <>
                      {/* Zorunlu */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedField.isRequired}
                          onChange={(e) => updateField(selectedField.id, { isRequired: e.target.checked })}
                          className="w-4 h-4 rounded accent-teal-600"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">Zorunlu alan</span>
                      </label>

                      {/* Birim (sayı alanları) */}
                      {selectedField.fieldType === 'number' && (
                        <FieldInput
                          label="Birim"
                          value={selectedField.unit || ''}
                          onChange={(v) => updateField(selectedField.id, { unit: v })}
                          placeholder="ton, bar, mm..."
                        />
                      )}

                      {/* Seçenekler (select alanları) */}
                      {selectedField.fieldType === 'select' && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1">
                            Seçenekler (virgülle ayırın)
                          </label>
                          <textarea
                            value={selectedField.options?.map((o) => o.label).join(', ') || ''}
                            onChange={(e) => {
                              const opts = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                              updateField(selectedField.id, {
                                options: opts.map((label) => ({
                                  value: generateFieldKey(label),
                                  label,
                                })),
                              });
                            }}
                            rows={3}
                            className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 bg-white dark:bg-slate-900"
                            placeholder="Uygun, Uygunsuz, Uygulanamaz"
                          />
                        </div>
                      )}

                      {/* Varsayılan Değer */}
                      <FieldInput
                        label="Varsayılan Değer"
                        value={selectedField.defaultValue || ''}
                        onChange={(v) => updateField(selectedField.id, { defaultValue: v })}
                        placeholder="Boş bırakılabilir"
                      />

                      {/* Placeholder */}
                      {(selectedField.fieldType === 'text' || selectedField.fieldType === 'textarea' || selectedField.fieldType === 'number') && (
                        <FieldInput
                          label="Placeholder"
                          value={selectedField.placeholder || ''}
                          onChange={(v) => updateField(selectedField.id, { placeholder: v })}
                          placeholder="Alan boşken görünecek metin"
                        />
                      )}

                      {/* Açıklama / İpucu */}
                      <FieldInput
                        label="Açıklama / İpucu"
                        value={selectedField.hint || ''}
                        onChange={(v) => updateField(selectedField.id, { hint: v })}
                      />

                      {/* ── Doğrulama Kuralları ──────────────────────────────── */}
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                        <p className="text-xs font-bold text-slate-500 uppercase mb-2">Doğrulama Kuralları</p>

                        {selectedField.fieldType === 'number' && (
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <div>
                              <label className="block text-xs text-slate-400 mb-0.5">Min</label>
                              <input
                                type="number"
                                value={selectedField.validation?.min ?? ''}
                                onChange={(e) => updateField(selectedField.id, {
                                  validation: {
                                    ...selectedField.validation,
                                    min: e.target.value ? Number(e.target.value) : undefined,
                                  },
                                })}
                                className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-400 mb-0.5">Max</label>
                              <input
                                type="number"
                                value={selectedField.validation?.max ?? ''}
                                onChange={(e) => updateField(selectedField.id, {
                                  validation: {
                                    ...selectedField.validation,
                                    max: e.target.value ? Number(e.target.value) : undefined,
                                  },
                                })}
                                className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
                              />
                            </div>
                          </div>
                        )}

                        {(selectedField.fieldType === 'text' || selectedField.fieldType === 'textarea') && (
                          <div>
                            <label className="block text-xs text-slate-400 mb-0.5">Regex Deseni</label>
                            <input
                              type="text"
                              value={selectedField.validation?.regex || ''}
                              onChange={(e) => updateField(selectedField.id, {
                                validation: { ...selectedField.validation, regex: e.target.value || undefined },
                              })}
                              className="w-full px-2 py-1.5 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
                              placeholder="^[A-Z]{2}\\d{4}$"
                            />
                          </div>
                        )}
                      </div>

                      {/* ── Koşullu Mantık ────────────────────────────────── */}
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                        <p className="text-xs font-bold text-slate-500 uppercase mb-2">Koşullu Görünürlük</p>
                        <p className="text-xs text-slate-400 mb-2">Bu alan yalnızca belirtilen koşul sağlandığında gösterilir</p>

                        <div className="space-y-2">
                          <div>
                            <label className="block text-xs text-slate-400 mb-0.5">Bağlı Alan (key)</label>
                            <select
                              value={selectedField.conditional?.fieldKey || ''}
                              onChange={(e) => updateField(selectedField.id, {
                                conditional: e.target.value
                                  ? { fieldKey: e.target.value, operator: selectedField.conditional?.operator || 'equals', value: selectedField.conditional?.value || '' }
                                  : undefined,
                              })}
                              className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
                            >
                              <option value="">Koşul Yok</option>
                              {fields.filter((f) => f.id !== selectedField.id && f.fieldType !== 'section_header').map((f) => (
                                <option key={f.id} value={f.fieldKey}>{f.label} ({f.fieldKey})</option>
                              ))}
                            </select>
                          </div>
                          {selectedField.conditional?.fieldKey && (
                            <>
                              <div>
                                <label className="block text-xs text-slate-400 mb-0.5">Operatör</label>
                                <select
                                  value={selectedField.conditional?.operator || 'equals'}
                                  onChange={(e) => updateField(selectedField.id, {
                                    conditional: { ...selectedField.conditional!, operator: e.target.value },
                                  })}
                                  className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
                                >
                                  <option value="equals">Eşittir</option>
                                  <option value="not_equals">Eşit Değildir</option>
                                  <option value="contains">İçerir</option>
                                  <option value="greater_than">Büyüktür</option>
                                  <option value="less_than">Küçüktür</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-slate-400 mb-0.5">Değer</label>
                                <input
                                  type="text"
                                  value={selectedField.conditional?.value || ''}
                                  onChange={(e) => updateField(selectedField.id, {
                                    conditional: { ...selectedField.conditional!, value: e.target.value },
                                  })}
                                  className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
                                  placeholder="Karşılaştırılacak değer"
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* ── PDF Koordinat ─────────────────────────────────── */}
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                        <p className="text-xs font-bold text-slate-500 uppercase mb-2">PDF Koordinatları</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(['page', 'x', 'y', 'width', 'height', 'fontSize'] as const).map((key) => (
                            <div key={key}>
                              <label className="block text-xs text-slate-400 mb-0.5">{key}</label>
                              <input
                                type="number"
                                value={(selectedField.pdfCoordinate as any)?.[key] ?? ''}
                                onChange={(e) => updateField(selectedField.id, {
                                  pdfCoordinate: {
                                    ...(selectedField.pdfCoordinate || { page: 1, x: 0, y: 0, width: 100, height: 20, fontSize: 10 }),
                                    [key]: Number(e.target.value),
                                  },
                                })}
                                className="w-full px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center">
                <Settings className="w-10 h-10 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
                <p className="text-sm text-slate-400">Düzenlemek için bir alan seçin</p>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ─── Alan Ekleme Modalı ───────────────────────────────────────────── */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Yeni Alan Ekle"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>İptal</Button>
            <Button onClick={addFieldFromModal}>Ekle</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Alan Tipi</label>
            <select
              value={newFieldType}
              onChange={(e) => setNewFieldType(e.target.value as FieldType)}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            >
              <option value="section_header">Bölüm Başlığı</option>
              {PALETTE_TYPES.map((t) => (
                <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <Input
            label="Etiket"
            required
            value={newFieldLabel}
            onChange={(e) => setNewFieldLabel(e.target.value)}
            placeholder="Alanın etiketi"
          />
          <Input
            label="Bölüm"
            value={newFieldSection}
            onChange={(e) => setNewFieldSection(e.target.value)}
            placeholder="Genel"
          />
          {newFieldType !== 'section_header' && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newFieldRequired}
                onChange={(e) => setNewFieldRequired(e.target.checked)}
                className="w-4 h-4 rounded accent-teal-600"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">Zorunlu alan</span>
            </label>
          )}
        </div>
      </Modal>
    </>
  );
}

/* ─── Yardımcı Bileşen ───────────────────────────────────────────────────── */
function FieldInput({
  label, value, onChange, placeholder, mono, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; mono?: boolean; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 bg-white dark:bg-slate-900 ${mono ? 'font-mono text-xs text-slate-500' : ''}`}
      />
      {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}
