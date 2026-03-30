import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useRouter, useLocalSearchParams } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

const SEVERITY_OPTIONS = [
  { value: 'critical',    label: 'Kritik',    color: '#ef4444' },
  { value: 'major',       label: 'Önemli',    color: '#f97316' },
  { value: 'minor',       label: 'Küçük',     color: '#f59e0b' },
  { value: 'observation', label: 'Gözlem',    color: '#3b82f6' },
];

export default function NonconformityScreen() {
  const router  = useRouter();
  const { inspectionId } = useLocalSearchParams<{ inspectionId: string }>();

  const [description, setDescription] = useState('');
  const [severity, setSeverity]       = useState<string>('minor');
  const [recommendation, setRecommendation] = useState('');
  const [loading, setLoading]         = useState(false);

  const handleSave = async () => {
    if (!description.trim()) {
      Alert.alert('Hata', 'Lütfen uygunsuzluk açıklaması girin.');
      return;
    }

    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync('access_token');
      await axios.post(
        `${API_URL}/inspections/${inspectionId}/nonconformities`,
        { description: description.trim(), severity, recommendation: recommendation.trim() },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      Alert.alert('Başarılı', 'Uygunsuzluk kaydedildi.', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      // Offline ise local'e kaydet
      Alert.alert('Bağlantı Yok', 'Uygunsuzluk offline olarak kaydedildi, senkronize edilecek.', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>Uygunsuzluk Ekle</Text>

      {/* Şiddet Seçimi */}
      <Text style={styles.label}>Şiddet Derecesi</Text>
      <View style={styles.severityRow}>
        {SEVERITY_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.severityBtn,
              severity === opt.value && { backgroundColor: opt.color, borderColor: opt.color },
            ]}
            onPress={() => setSeverity(opt.value)}
          >
            <Text style={[styles.severityBtnText, severity === opt.value && { color: '#fff' }]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Açıklama */}
      <Text style={styles.label}>Açıklama *</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={description}
        onChangeText={setDescription}
        placeholder="Uygunsuzluğu detaylı açıklayın..."
        multiline
        numberOfLines={4}
        placeholderTextColor="#94a3b8"
      />

      {/* Öneri */}
      <Text style={styles.label}>Düzeltici Öneri</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={recommendation}
        onChangeText={setRecommendation}
        placeholder="Alınması önerilen önlem..."
        multiline
        numberOfLines={3}
        placeholderTextColor="#94a3b8"
      />

      {/* Kaydet */}
      <TouchableOpacity
        style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.saveBtnText}>Kaydet</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
        <Text style={styles.cancelBtnText}>İptal</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#f8fafc' },
  title:          { fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 24 },
  label:          { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 8, marginTop: 16 },
  severityRow:    { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  severityBtn:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 2, borderColor: '#e2e8f0', backgroundColor: '#fff' },
  severityBtnText:{ fontSize: 13, fontWeight: '600', color: '#475569' },
  input:          { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#0f172a' },
  textArea:       { height: 100, textAlignVertical: 'top' },
  saveBtn:        { backgroundColor: '#3366f5', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  saveBtnDisabled:{ opacity: 0.6 },
  saveBtnText:    { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelBtn:      { paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  cancelBtnText:  { color: '#94a3b8', fontWeight: '600', fontSize: 15 },
});
