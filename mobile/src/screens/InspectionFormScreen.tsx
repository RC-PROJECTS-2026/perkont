import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, StyleSheet, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import {
  saveFieldValue, getFieldValues, savePhoto,
  completeInspection, getCachedFormTemplate, createLocalInspection,
} from '../lib/offline-db';
import { SyncEngine } from '../lib/sync-engine';
import { router, useLocalSearchParams } from 'expo-router';

const RESULT_OPTIONS = [
  { value: 'uygun',       label: 'Uygun',       color: '#10b981' },
  { value: 'uygunsuz',    label: 'Uygunsuz',    color: '#ef4444' },
  { value: 'uygulanamaz', label: 'Uygulanamaz', color: '#94a3b8' },
];

export default function InspectionFormScreen() {
  const { inspectionId, templateId, equipmentId, workOrderId } = useLocalSearchParams<{
    inspectionId?: string;
    templateId: string;
    equipmentId: string;
    workOrderId?: string;
  }>();

  const [template, setTemplate] = useState<any>(null);
  const [values, setValues] = useState<Record<string, any>>({});
  const [photos, setPhotos] = useState<Record<string, string[]>>({});
  const [currentSection, setCurrentSection] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localInspectionId, setLocalInspectionId] = useState<string | null>(inspectionId || null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    initInspection();
  }, []);

  const initInspection = async () => {
    setLoading(true);
    try {
      // GPS al
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      }

      // Form şablonunu yükle (önce cache'den)
      const tmpl = await getCachedFormTemplate(templateId as string);
      if (!tmpl) {
        Alert.alert('Hata', 'Form şablonu bulunamadı. Lütfen çevrimiçiyken tekrar deneyin.');
        return;
      }
      setTemplate(tmpl);

      // Denetim oluştur veya mevcut yükle
      let insId = localInspectionId;
      if (!insId) {
        insId = await createLocalInspection({
          workOrderId: workOrderId || null,
          equipmentId: equipmentId as string,
          formTemplateId: templateId as string,
          formTemplateRevision: tmpl.revision,
          latitude: location?.lat,
          longitude: location?.lng,
          deviceId: 'mobile',
        });
        setLocalInspectionId(insId);
      }

      // Daha önce girilen değerleri yükle
      const existingValues = await getFieldValues(insId);
      setValues(existingValues);
    } catch (err: any) {
      Alert.alert('Hata', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = useCallback(async (fieldKey: string, value: any, fieldId?: string) => {
    if (!localInspectionId) return;
    setValues((prev) => ({ ...prev, [fieldKey]: value }));
    await saveFieldValue(localInspectionId, fieldKey, value, fieldId);
  }, [localInspectionId]);

  const handleTakePhoto = async (fieldKey: string) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('İzin Gerekli', 'Fotoğraf çekmek için kamera erişimi gereklidir.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      exif: true,
    });

    if (!result.canceled && result.assets[0] && localInspectionId) {
      const asset = result.assets[0];
      const loc = await Location.getCurrentPositionAsync({}).catch(() => null);

      await savePhoto({
        inspectionId: localInspectionId,
        fieldKey,
        localPath: asset.uri,
        takenAt: new Date().toISOString(),
        latitude: loc?.coords.latitude,
        longitude: loc?.coords.longitude,
      });

      setPhotos((prev) => ({
        ...prev,
        [fieldKey]: [...(prev[fieldKey] || []), asset.uri],
      }));
    }
  };

  const handleComplete = async () => {
    if (!localInspectionId) return;

    // Zorunlu alan kontrolü
    const requiredFields = template.fields.filter((f: any) => f.isRequired);
    const missingFields = requiredFields.filter((f: any) => !values[f.fieldKey]);

    if (missingFields.length > 0) {
      Alert.alert(
        'Zorunlu Alanlar Eksik',
        `Lütfen şu alanları doldurun:\n${missingFields.map((f: any) => `• ${f.label}`).join('\n')}`,
      );
      return;
    }

    // Genel sonuç sor
    Alert.alert(
      'Denetim Sonucu',
      'Bu denetimin genel sonucunu seçiniz:',
      [
        ...RESULT_OPTIONS.map((opt) => ({
          text: opt.label,
          onPress: async () => {
            setSaving(true);
            try {
              await completeInspection(localInspectionId, opt.value, values['inspector_notes']);
              Alert.alert(
                'Denetim Tamamlandı',
                'Denetim kaydedildi. Çevrimiçi olduğunuzda otomatik senkronize edilecektir.',
                [{ text: 'Tamam', onPress: () => router.back() }],
              );
              // Bağlantı varsa hemen sync dene
              SyncEngine.getInstance().sync().catch(console.warn);
            } catch (err: any) {
              Alert.alert('Hata', err.message);
            } finally {
              setSaving(false);
            }
          },
        })),
        { text: 'İptal', style: 'cancel' },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3366f5" />
        <Text style={styles.loadingText}>Form yükleniyor...</Text>
      </View>
    );
  }

  if (!template) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Form şablonu bulunamadı</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Geri Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Bölümlere göre grupla
  const sections: Record<string, any[]> = {};
  for (const field of template.fields) {
    const sec = field.section || 'Genel';
    if (!sections[sec]) sections[sec] = [];
    sections[sec].push(field);
  }
  const sectionKeys = Object.keys(sections);
  const currentFields = sections[sectionKeys[currentSection]] || [];
  const progress = Math.round(((currentSection + 1) / sectionKeys.length) * 100);
  const filledCount = template.fields.filter((f: any) => values[f.fieldKey] !== undefined && values[f.fieldKey] !== null && values[f.fieldKey] !== '').length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{template.name}</Text>
          <Text style={styles.headerSub}>{template.revision} · {filledCount}/{template.fields.length} alan</Text>
        </View>
        <TouchableOpacity onPress={handleComplete} disabled={saving} style={styles.completeBtn}>
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.completeBtnText}>Bitir</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      {/* Section tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sectionTabs}>
        {sectionKeys.map((sec, idx) => (
          <TouchableOpacity
            key={sec}
            onPress={() => setCurrentSection(idx)}
            style={[styles.sectionTab, idx === currentSection && styles.sectionTabActive]}
          >
            <Text style={[styles.sectionTabText, idx === currentSection && styles.sectionTabTextActive]}>
              {sec}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Form fields */}
      <ScrollView style={styles.formContainer} contentContainerStyle={styles.formContent}>
        {currentFields.map((field: any) => (
          <FieldRenderer
            key={field.fieldKey}
            field={field}
            value={values[field.fieldKey]}
            photos={photos[field.fieldKey] || []}
            onChange={(v) => handleFieldChange(field.fieldKey, v, field.id)}
            onPhotoTake={() => handleTakePhoto(field.fieldKey)}
          />
        ))}
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Navigation */}
      <View style={styles.navigation}>
        <TouchableOpacity
          onPress={() => setCurrentSection((s) => Math.max(0, s - 1))}
          disabled={currentSection === 0}
          style={[styles.navBtn, currentSection === 0 && styles.navBtnDisabled]}
        >
          <Ionicons name="chevron-back" size={18} color={currentSection === 0 ? '#cbd5e1' : '#3366f5'} />
          <Text style={[styles.navBtnText, currentSection === 0 && styles.navBtnTextDisabled]}>Önceki</Text>
        </TouchableOpacity>

        <Text style={styles.pageIndicator}>{currentSection + 1} / {sectionKeys.length}</Text>

        {currentSection < sectionKeys.length - 1 ? (
          <TouchableOpacity
            onPress={() => setCurrentSection((s) => s + 1)}
            style={styles.navBtn}
          >
            <Text style={styles.navBtnText}>Sonraki</Text>
            <Ionicons name="chevron-forward" size={18} color="#3366f5" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleComplete} style={styles.finishBtn}>
            <Text style={styles.finishBtnText}>Denetimi Tamamla</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Field Renderer ───────────────────────────────────────────────────────────
function FieldRenderer({ field, value, photos, onChange, onPhotoTake }: {
  field: any;
  value: any;
  photos: string[];
  onChange: (v: any) => void;
  onPhotoTake: () => void;
}) {
  if (field.fieldType === 'section_header') {
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>{field.label}</Text>
        <View style={styles.sectionHeaderLine} />
      </View>
    );
  }

  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>
        {field.label}
        {field.isRequired && <Text style={styles.required}> *</Text>}
        {field.unit && <Text style={styles.unit}> ({field.unit})</Text>}
      </Text>

      {field.fieldType === 'check_item' && (
        <View style={styles.checkRow}>
          {RESULT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => onChange(opt.value)}
              style={[
                styles.checkOption,
                value === opt.value && { backgroundColor: opt.color, borderColor: opt.color },
              ]}
            >
              <Text style={[styles.checkOptionText, value === opt.value && { color: '#fff' }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {field.fieldType === 'check_matrix' && field.checkItems && (
        <View style={styles.matrixContainer}>
          {field.checkItems.map((item: any) => (
            <View key={item.id} style={styles.matrixRow}>
              <Text style={styles.matrixLabel} numberOfLines={2}>{item.label}</Text>
              <View style={styles.matrixOptions}>
                {RESULT_OPTIONS.map((opt) => {
                  const matrixValues = value || {};
                  const itemVal = matrixValues[item.id];
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => onChange({ ...matrixValues, [item.id]: opt.value })}
                      style={[
                        styles.matrixOption,
                        itemVal === opt.value && { backgroundColor: opt.color },
                      ]}
                    >
                      <Text style={[styles.matrixOptionText, itemVal === opt.value && { color: '#fff' }]}>
                        {opt.label.charAt(0)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      )}

      {(field.fieldType === 'text' || field.fieldType === 'textarea') && (
        <TextInput
          style={[styles.input, field.fieldType === 'textarea' && styles.textarea]}
          value={String(value || '')}
          onChangeText={onChange}
          multiline={field.fieldType === 'textarea'}
          numberOfLines={field.fieldType === 'textarea' ? 4 : 1}
          placeholder={field.placeholder || `${field.label} giriniz...`}
          placeholderTextColor="#94a3b8"
        />
      )}

      {field.fieldType === 'number' && (
        <TextInput
          style={styles.input}
          value={value !== undefined && value !== null ? String(value) : ''}
          onChangeText={(t) => onChange(t === '' ? null : parseFloat(t))}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor="#94a3b8"
        />
      )}

      {field.fieldType === 'boolean' && (
        <View style={styles.checkRow}>
          {[{ value: true, label: 'Evet' }, { value: false, label: 'Hayır' }].map((opt) => (
            <TouchableOpacity
              key={String(opt.value)}
              onPress={() => onChange(opt.value)}
              style={[
                styles.checkOption,
                value === opt.value && { backgroundColor: '#3366f5', borderColor: '#3366f5' },
              ]}
            >
              <Text style={[styles.checkOptionText, value === opt.value && { color: '#fff' }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {field.fieldType === 'select' && field.options && (
        <View style={styles.selectContainer}>
          {field.options.map((opt: any) => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => onChange(opt.value)}
              style={[styles.selectOption, value === opt.value && styles.selectOptionActive]}
            >
              <Text style={[styles.selectOptionText, value === opt.value && styles.selectOptionTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {field.fieldType === 'photo' && (
        <View>
          <TouchableOpacity style={styles.photoBtn} onPress={onPhotoTake}>
            <Ionicons name="camera-outline" size={20} color="#3366f5" />
            <Text style={styles.photoBtnText}>Fotoğraf Çek</Text>
          </TouchableOpacity>
          {photos.length > 0 && (
            <ScrollView horizontal style={styles.photoRow}>
              {photos.map((uri, idx) => (
                <Image key={idx} source={{ uri }} style={styles.photoThumb} />
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#64748b', fontSize: 14 },
  errorText: { color: '#ef4444', fontSize: 16, marginBottom: 16 },
  backBtn: { backgroundColor: '#3366f5', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  backBtnText: { color: '#fff', fontWeight: '600' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3366f5', paddingHorizontal: 16, paddingVertical: 12, paddingTop: 52, gap: 12 },
  backButton: { padding: 4 },
  headerInfo: { flex: 1 },
  headerTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  completeBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  completeBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  progressBar: { height: 3, backgroundColor: '#dbeafe' },
  progressFill: { height: 3, backgroundColor: '#3366f5' },
  sectionTabs: { maxHeight: 48, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  sectionTab: { paddingHorizontal: 16, paddingVertical: 14 },
  sectionTabActive: { borderBottomWidth: 2, borderBottomColor: '#3366f5' },
  sectionTabText: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  sectionTabTextActive: { color: '#3366f5', fontWeight: '700' },
  formContainer: { flex: 1 },
  formContent: { padding: 16, gap: 16 },
  sectionHeader: { marginTop: 8, marginBottom: 4 },
  sectionHeaderText: { fontSize: 13, fontWeight: '700', color: '#3366f5', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionHeaderLine: { height: 1, backgroundColor: '#dbeafe', marginTop: 6 },
  fieldContainer: { backgroundColor: '#fff', borderRadius: 12, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 10 },
  required: { color: '#ef4444' },
  unit: { color: '#94a3b8', fontWeight: '400' },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0f172a', backgroundColor: '#f8fafc' },
  textarea: { height: 100, textAlignVertical: 'top' },
  checkRow: { flexDirection: 'row', gap: 8 },
  checkOption: { flex: 1, borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  checkOptionText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  matrixContainer: { gap: 1 },
  matrixRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 8 },
  matrixLabel: { flex: 1, fontSize: 13, color: '#334155' },
  matrixOptions: { flexDirection: 'row', gap: 4 },
  matrixOption: { width: 32, height: 28, borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  matrixOptionText: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  selectContainer: { gap: 6 },
  selectOption: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  selectOptionActive: { borderColor: '#3366f5', backgroundColor: '#eff6ff' },
  selectOptionText: { fontSize: 14, color: '#475569' },
  selectOptionTextActive: { color: '#3366f5', fontWeight: '600' },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: '#3366f5', borderStyle: 'dashed', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center' },
  photoBtnText: { color: '#3366f5', fontWeight: '600', fontSize: 14 },
  photoRow: { marginTop: 8 },
  photoThumb: { width: 80, height: 80, borderRadius: 8, marginRight: 8 },
  navigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 10 },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: { color: '#3366f5', fontWeight: '600', fontSize: 14 },
  navBtnTextDisabled: { color: '#cbd5e1' },
  pageIndicator: { fontSize: 13, color: '#94a3b8', fontWeight: '500' },
  finishBtn: { backgroundColor: '#3366f5', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  finishBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
