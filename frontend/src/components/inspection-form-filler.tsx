'use client';
import React, { useState, useCallback, useMemo } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { inspectionsApi } from '@/lib/api';
import apiClient from '@/lib/api-client';
import { Button, Card, Badge, Modal } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  Save, CheckCircle2, XCircle, Camera,
  ChevronDown, ChevronRight, ChevronLeft, AlertTriangle,
  ClipboardCheck, Hash, Type, Calendar, Image, PenTool,
  Loader2, Check,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormField {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  orderIndex: number;
  options?: string[];
  pdfCoordinate?: any;
  isConditional?: boolean;
  conditionRule?: any;
}

interface FieldValue {
  fieldKey: string;
  value: any;
  mediaUrls?: string[];
  timestamp?: string;
}

interface Props {
  inspectionId: string;
  formTemplateId: string;
  existingValues: FieldValue[];
  editable: boolean;
  onSaved?: () => void;
}

// ─── Field Type Icons ─────────────────────────────────────────────────────────

const FIELD_ICONS: Record<string, React.ReactNode> = {
  CHECK_ITEM: <ClipboardCheck className="w-4 h-4 text-teal-500" />,
  NUMBER: <Hash className="w-4 h-4 text-blue-500" />,
  TEXT: <Type className="w-4 h-4 text-slate-500" />,
  TEXTAREA: <Type className="w-4 h-4 text-slate-500" />,
  DATE: <Calendar className="w-4 h-4 text-amber-500" />,
  PHOTO: <Image className="w-4 h-4 text-violet-500" />,
  SIGNATURE: <PenTool className="w-4 h-4 text-pink-500" />,
  SECTION_HEADER: null,
  SELECT: <ChevronDown className="w-4 h-4 text-indigo-500" />,
  BOOLEAN: <ClipboardCheck className="w-4 h-4 text-emerald-500" />,
};

// ─── Section type ─────────────────────────────────────────────────────────────

interface Section {
  key: string;
  label: string;
  fields: FormField[];
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InspectionFormFiller({
  inspectionId, formTemplateId, existingValues, editable, onSaved,
}: Props) {
  const queryClient = useQueryClient();

  // Load form template fields
  const { data: templateData, isLoading: loadingTemplate } = useQuery({
    queryKey: ['form-template', formTemplateId],
    queryFn: () => apiClient.get(`/form-templates/${formTemplateId}`),
    enabled: !!formTemplateId,
  });

  const template = (templateData as any)?.data || templateData;
  const fields: FormField[] = template?.fields || [];

  // Local state
  const [values, setValues] = useState<Record<string, any>>(() => {
    const map: Record<string, any> = {};
    existingValues.forEach(v => { map[v.fieldKey] = v.value; });
    return map;
  });

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [completeModal, setCompleteModal] = useState(false);
  const [overallResult, setOverallResult] = useState('');
  const [inspectorNotes, setInspectorNotes] = useState('');

  // ── Group fields into sections ───────────────────────────────────────

  const sections: Section[] = useMemo(() => {
    const sorted = [...fields].sort((a, b) => a.orderIndex - b.orderIndex);
    const result: Section[] = [];
    let current: Section | null = null;

    for (const field of sorted) {
      if (field.fieldType.toUpperCase() === 'SECTION_HEADER') {
        current = { key: field.fieldKey, label: field.label, fields: [] };
        result.push(current);
      } else if (current) {
        current.fields.push(field);
      } else {
        // Fields before any section header
        if (!result.length || result[0].key !== '__general') {
          result.unshift({ key: '__general', label: 'Genel Bilgiler', fields: [] });
        }
        result[0].fields.push(field);
      }
    }

    // Remove empty sections
    return result.filter(s => s.fields.length > 0);
  }, [fields]);

  // ── Section progress calculation ─────────────────────────────────────

  const sectionProgress = useMemo(() => {
    return sections.map(section => {
      const total = section.fields.length;
      const filled = section.fields.filter(f =>
        values[f.fieldKey] != null && values[f.fieldKey] !== '' && values[f.fieldKey] !== false
      ).length;
      return { total, filled, percent: total > 0 ? Math.round((filled / total) * 100) : 0 };
    });
  }, [sections, values]);

  const totalProgress = useMemo(() => {
    const req = fields.filter(f => f.isRequired && f.fieldType.toUpperCase() !== 'SECTION_HEADER');
    const filled = req.filter(f => values[f.fieldKey] != null && values[f.fieldKey] !== '' && values[f.fieldKey] !== false);
    return { required: req.length, filled: filled.length, percent: req.length > 0 ? Math.round((filled.length / req.length) * 100) : 0 };
  }, [fields, values]);

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleChange = useCallback((fieldKey: string, value: any) => {
    setValues(prev => ({ ...prev, [fieldKey]: value }));
    setDirty(true);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const fieldValues = Object.entries(values).map(([fieldKey, value]) => ({
        fieldKey,
        value: value ?? '',
        timestamp: new Date().toISOString(),
      }));
      await inspectionsApi.saveFieldValues(inspectionId, { fieldValues });
      setDirty(false);
      toast.success('Form kaydedildi');
      queryClient.invalidateQueries({ queryKey: ['inspection', inspectionId] });
      onSaved?.();
    } catch (e: any) {
      toast.error(e.message || 'Kaydetme hatasi');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!overallResult) { toast.error('Denetim sonucu seciniz'); return; }
    try {
      if (dirty) await handleSave();
      await inspectionsApi.complete(inspectionId, { overallResult, inspectorNotes });
      toast.success('Denetim tamamlandi');
      setCompleteModal(false);
      queryClient.invalidateQueries({ queryKey: ['inspection', inspectionId] });
      queryClient.invalidateQueries({ queryKey: ['inspections'] });
      onSaved?.();
    } catch (e: any) {
      toast.error(e.message || 'Tamamlama hatasi');
    }
  };

  const handlePhotoUpload = async (fieldKey: string, file: File) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fieldKey', fieldKey);
      await inspectionsApi.uploadPhoto(inspectionId, formData);
      toast.success('Fotograf yuklendi');
      queryClient.invalidateQueries({ queryKey: ['inspection', inspectionId] });
    } catch (e: any) {
      toast.error(e.message || 'Yukleme hatasi');
    }
  };

  const goNext = () => {
    if (activeStep < sections.length - 1) setActiveStep(activeStep + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goPrev = () => {
    if (activeStep > 0) setActiveStep(activeStep - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Render Field ──────────────────────────────────────────────────────

  const renderField = (field: FormField) => {
    const val = values[field.fieldKey] ?? '';
    const ft = field.fieldType.toUpperCase();
    const icon = FIELD_ICONS[ft];
    const isFilled = val != null && val !== '' && val !== false;

    const wrapper = (children: React.ReactNode) => (
      <div key={field.id} className={cn(
        "py-3 px-4 rounded-lg border transition-all",
        isFilled ? "border-green-200 dark:border-green-900/50 bg-green-50/30 dark:bg-green-950/10" : "border-slate-200 dark:border-slate-700",
      )}>
        {children}
      </div>
    );

    switch (ft) {
      case 'CHECK_ITEM':
      case 'BOOLEAN':
        return wrapper(
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={val === true || val === 'true' || val === 'uygun' || val === 'Uygun' || val === 1}
              onChange={(e) => handleChange(field.fieldKey, e.target.checked)}
              disabled={!editable}
              className="h-5 w-5 rounded border-slate-300 dark:border-slate-600 text-teal-500 focus:ring-teal-500 disabled:opacity-50"
            />
            <span className={cn("text-sm flex-1", field.isRequired && "font-medium")}>
              {field.label}
              {field.isRequired && <span className="text-red-400 ml-1">*</span>}
            </span>
            {isFilled && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
          </label>
        );

      case 'NUMBER':
        return wrapper(
          <>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              {icon} {field.label}
              {field.isRequired && <span className="text-red-400 ml-1">*</span>}
            </label>
            <input type="number" step="any" value={val}
              onChange={(e) => handleChange(field.fieldKey, e.target.value)}
              disabled={!editable} placeholder="Deger girin..."
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50" />
          </>
        );

      case 'TEXT':
      case 'TEXTAREA':
        return wrapper(
          <>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              {icon} {field.label}
              {field.isRequired && <span className="text-red-400 ml-1">*</span>}
            </label>
            {field.fieldType === 'TEXTAREA' ? (
              <textarea value={val} onChange={(e) => handleChange(field.fieldKey, e.target.value)}
                disabled={!editable} rows={3} placeholder="Aciklama yazin..."
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:ring-2 focus:ring-teal-500/20 disabled:opacity-50 resize-none" />
            ) : (
              <input type="text" value={val} onChange={(e) => handleChange(field.fieldKey, e.target.value)}
                disabled={!editable} placeholder="Deger girin..."
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:ring-2 focus:ring-teal-500/20 disabled:opacity-50" />
            )}
          </>
        );

      case 'DATE':
        return wrapper(
          <>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              {icon} {field.label}
              {field.isRequired && <span className="text-red-400 ml-1">*</span>}
            </label>
            <input type="date" value={val} onChange={(e) => handleChange(field.fieldKey, e.target.value)}
              disabled={!editable}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:ring-2 focus:ring-teal-500/20 disabled:opacity-50" />
          </>
        );

      case 'SELECT':
        return wrapper(
          <>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              {icon} {field.label}
              {field.isRequired && <span className="text-red-400 ml-1">*</span>}
            </label>
            <select value={val} onChange={(e) => handleChange(field.fieldKey, e.target.value)}
              disabled={!editable}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 disabled:opacity-50">
              <option value="">Seciniz...</option>
              {(field.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </>
        );

      case 'PHOTO':
        return wrapper(
          <>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              {icon} {field.label}
            </label>
            {editable ? (
              <label className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg cursor-pointer hover:border-teal-400 transition-colors">
                <Camera className="w-5 h-5 text-slate-400" />
                <span className="text-sm text-slate-500">Fotograf sec veya cek</span>
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(field.fieldKey, f); }} />
              </label>
            ) : <span className="text-sm text-slate-400">Salt okunur</span>}
          </>
        );

      case 'SIGNATURE':
        return wrapper(
          <>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              {icon} {field.label}
            </label>
            <div className="h-20 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg flex items-center justify-center text-sm text-slate-400">
              {val ? 'Imza mevcut' : 'Imza alani (mobil cihazda aktif)'}
            </div>
          </>
        );

      default:
        return wrapper(
          <>
            <label className="block text-sm text-slate-500 mb-1">{field.label}</label>
            <input type="text" value={val} onChange={(e) => handleChange(field.fieldKey, e.target.value)}
              disabled={!editable}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 disabled:opacity-50" />
          </>
        );
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────

  if (loadingTemplate) {
    return (
      <Card className="p-8 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-500" />
        <p className="text-sm text-slate-500">Form sablonu yukleniyor...</p>
      </Card>
    );
  }

  if (!fields.length) {
    return (
      <Card className="p-8 text-center">
        <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-amber-500" />
        <p className="text-sm text-slate-500">Form sablonunda alan bulunamadi.</p>
      </Card>
    );
  }

  if (!sections.length) {
    return (
      <Card className="p-8 text-center">
        <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-amber-500" />
        <p className="text-sm text-slate-500">Form bolum basliklarini iceremedi.</p>
      </Card>
    );
  }

  const currentSection = sections[activeStep];
  const currentProgress = sectionProgress[activeStep];

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Genel ilerleme */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Genel Ilerleme: %{totalProgress.percent}
          </span>
          <span className="text-xs text-slate-400">
            {totalProgress.filled}/{totalProgress.required} zorunlu alan
          </span>
        </div>
        <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              totalProgress.percent === 100 ? "bg-green-500" : "bg-gradient-to-r from-teal-500 to-cyan-400"
            )}
            style={{ width: `${totalProgress.percent}%` }}
          />
        </div>
      </Card>

      {/* Eylem butonlari */}
      {editable && (
        <div className="flex gap-3 sticky top-0 z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm py-3 rounded-lg">
          <Button onClick={handleSave} loading={saving} disabled={!dirty} icon={<Save className="w-4 h-4" />} size="sm">
            Kaydet
          </Button>
          <Button variant="outline" onClick={() => setCompleteModal(true)} icon={<CheckCircle2 className="w-4 h-4" />} size="sm">
            Denetimi Tamamla
          </Button>
          {dirty && <Badge color="bg-amber-100 text-amber-700">Kaydedilmemis</Badge>}
        </div>
      )}

      <div className="flex gap-4">
        {/* ── Sol: Bolum navigasyonu ──────────────────────────────────── */}
        <div className="w-64 flex-shrink-0 hidden lg:block">
          <Card className="sticky top-16 max-h-[calc(100vh-200px)] overflow-y-auto" padding="none">
            <div className="p-3 border-b border-slate-100 dark:border-slate-800">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Bolumler</p>
            </div>
            <div className="p-2 space-y-1">
              {sections.map((section, idx) => {
                const prog = sectionProgress[idx];
                const isActive = idx === activeStep;
                const isComplete = prog.percent === 100;
                return (
                  <button
                    key={section.key}
                    onClick={() => setActiveStep(idx)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all",
                      isActive
                        ? "bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {/* Adim numarasi / tamamlanma */}
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                        isComplete
                          ? "bg-green-500 text-white"
                          : isActive
                          ? "bg-teal-500 text-white"
                          : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400",
                      )}>
                        {isComplete ? <Check className="w-3 h-3" /> : idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "truncate font-medium",
                          isActive ? "text-teal-700 dark:text-teal-300" : "text-slate-600 dark:text-slate-400",
                        )}>
                          {section.label.replace(/^\d+\.\s*/, '').substring(0, 30)}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {prog.filled}/{prog.total} alan
                        </p>
                      </div>
                    </div>
                    {/* Mini ilerleme */}
                    <div className="w-full h-1 bg-slate-100 dark:bg-slate-700 rounded-full mt-2 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", isComplete ? "bg-green-500" : "bg-teal-400")}
                        style={{ width: `${prog.percent}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        {/* ── Sag: Aktif bolum alanlari ──────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* Bolum basligi */}
          <Card className="mb-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-teal-500">BOLUM {activeStep + 1}/{sections.length}</span>
                  {currentProgress.percent === 100 && (
                    <Badge color="bg-green-100 text-green-700">Tamamlandi</Badge>
                  )}
                </div>
                <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 mt-1">
                  {currentSection.label}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {currentProgress.filled}/{currentProgress.total} alan dolduruldu
                </p>
              </div>
              <div className="text-right">
                <div className="w-14 h-14 relative">
                  <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-100 dark:text-slate-800" />
                    <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="2"
                      className={currentProgress.percent === 100 ? "text-green-500" : "text-teal-500"}
                      strokeDasharray={`${currentProgress.percent} ${100 - currentProgress.percent}`}
                      strokeLinecap="round" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">
                    %{currentProgress.percent}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Mobil bolum secici */}
          <div className="lg:hidden mb-3">
            <select
              value={activeStep}
              onChange={(e) => setActiveStep(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
            >
              {sections.map((s, i) => (
                <option key={s.key} value={i}>
                  {i + 1}. {s.label.replace(/^\d+\.\s*/, '')} ({sectionProgress[i].percent}%)
                </option>
              ))}
            </select>
          </div>

          {/* Alanlar */}
          <div className="space-y-2">
            {currentSection.fields.map(field => renderField(field))}
          </div>

          {/* Navigasyon */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
            <Button
              variant="outline"
              onClick={goPrev}
              disabled={activeStep === 0}
              icon={<ChevronLeft className="w-4 h-4" />}
            >
              Onceki Bolum
            </Button>

            <span className="text-xs text-slate-400">
              {activeStep + 1} / {sections.length}
            </span>

            {activeStep === sections.length - 1 ? (
              <Button
                onClick={() => editable ? setCompleteModal(true) : undefined}
                icon={<CheckCircle2 className="w-4 h-4" />}
                disabled={!editable}
              >
                Denetimi Tamamla
              </Button>
            ) : (
              <Button onClick={goNext} icon={<ChevronRight className="w-4 h-4" />}>
                Sonraki Bolum
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Tamamlama Modali ───────────────────────────────────────────── */}
      {completeModal && (
        <Modal open={completeModal} title="Denetimi Tamamla" onClose={() => setCompleteModal(false)}>
          <div className="space-y-4 p-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Denetim Sonucu *
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'uygun', label: 'Uygun', color: 'border-green-500 bg-green-50 text-green-700' },
                  { value: 'uygunsuz', label: 'Uygunsuz', color: 'border-red-500 bg-red-50 text-red-700' },
                  { value: 'kismi_uygun', label: 'Kismi Uygun', color: 'border-amber-500 bg-amber-50 text-amber-700' },
                  { value: 'uygulanamaz', label: 'Uygulanamaz', color: 'border-slate-400 bg-slate-50 text-slate-600' },
                  { value: 'denetlenemedi', label: 'Denetlenemedi', color: 'border-purple-500 bg-purple-50 text-purple-700' },
                  { value: 'ertelendi', label: 'Ertelendi', color: 'border-orange-500 bg-orange-50 text-orange-700' },
                ].map(opt => (
                  <button key={opt.value} onClick={() => setOverallResult(opt.value)}
                    className={cn(
                      'px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all',
                      overallResult === opt.value ? opt.color : 'border-slate-200 dark:border-slate-700 hover:border-slate-300',
                    )}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Denetci Notlari</label>
              <textarea value={inspectorNotes} onChange={(e) => setInspectorNotes(e.target.value)}
                rows={3} placeholder="Gozlemlerinizi yazin..."
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 focus:ring-2 focus:ring-teal-500/20" />
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={handleComplete} icon={<CheckCircle2 className="w-4 h-4" />}>Tamamla</Button>
              <Button variant="outline" onClick={() => setCompleteModal(false)}>Iptal</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
