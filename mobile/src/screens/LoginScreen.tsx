import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import { initDatabase } from '../lib/offline-db';
import { SyncEngine } from '../lib/sync-engine';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export default function LoginScreen() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode]   = useState('');
  const [tempToken, setTempToken] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Hata', 'E-posta ve şifre zorunludur');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/login`, {
        email: email.toLowerCase().trim(),
        password,
        deviceId: 'mobile-app',
      });

      const result = res.data?.data;

      if (result?.requiresMfa) {
        setTempToken(result.tempToken);
        setMfaRequired(true);
        return;
      }

      await onLoginSuccess(result);
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'Giriş yapılamadı';
      Alert.alert('Giriş Hatası', Array.isArray(message) ? message.join('\n') : message);
    } finally {
      setLoading(false);
    }
  };

  const handleMfaVerify = async () => {
    if (mfaCode.length !== 6) {
      Alert.alert('Hata', '6 haneli doğrulama kodunu giriniz');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/mfa/verify`, {
        tempToken,
        token: mfaCode,
      });
      await onLoginSuccess(res.data?.data);
    } catch (err: any) {
      Alert.alert('Hata', 'Doğrulama kodu geçersiz');
    } finally {
      setLoading(false);
    }
  };

  const onLoginSuccess = async (result: any) => {
    // Token'ları güvenli depolamaya kaydet
    await SecureStore.setItemAsync('access_token', result.accessToken);
    await SecureStore.setItemAsync('refresh_token', result.refreshToken);
    await SecureStore.setItemAsync('user_data', JSON.stringify(result.user));

    // Cihazı sunucuya kaydet / güncelle
    try {
      const { Platform } = await import('react-native');
      const Constants = await import('expo-constants');
      await axios.post(`${API_URL}/devices/register`, {
        deviceId:    Constants.default.deviceId || `dev_${Date.now()}`,
        platform:    Platform.OS as 'ios' | 'android',
        osVersion:   `${Platform.OS} ${Platform.Version}`,
        appVersion:  Constants.default.expoConfig?.version || '1.0.0',
        buildNumber: String(Constants.default.expoConfig?.ios?.buildNumber || Constants.default.expoConfig?.android?.versionCode || '1'),
      }, { headers: { Authorization: `Bearer ${result.accessToken}` } });
    } catch {
      // Cihaz kaydı opsiyonel — hata alınırsa devam et
    }

    // DB'yi başlat
    await initDatabase();

    // İş emirlerini çek
    try {
      await SyncEngine.getInstance().pullWorkOrders();
    } catch {
      // Offline olabilir, sorun değil
    }

    router.replace('/');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoBox}>
            <Ionicons name="flash" size={32} color="#fff" />
          </View>
          <Text style={styles.appName}>PerKont</Text>
          <Text style={styles.appSub}>Saha Denetim Uygulaması</Text>
        </View>

        {!mfaRequired ? (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Giriş Yap</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>E-posta Adresi</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="ornek@firma.com"
                  placeholderTextColor="#94a3b8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Şifre</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Şifrenizi giriniz"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showPw}
                  editable={!loading}
                />
                <TouchableOpacity onPress={() => setShowPw(!showPw)} style={styles.eyeBtn}>
                  <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color="#94a3b8" />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={styles.loginBtnText}>Giriş Yap</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>

            <View style={styles.offlineNote}>
              <Ionicons name="wifi-outline" size={14} color="#94a3b8" />
              <Text style={styles.offlineNoteText}>
                Giriş için internet bağlantısı gereklidir
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.formCard}>
            <View style={styles.mfaHeader}>
              <Ionicons name="shield-checkmark-outline" size={32} color="#3366f5" />
              <Text style={styles.formTitle}>Doğrulama Kodu</Text>
              <Text style={styles.mfaDesc}>
                Authenticator uygulamanızdaki 6 haneli kodu giriniz
              </Text>
            </View>

            <TextInput
              style={[styles.input, styles.mfaInput]}
              value={mfaCode}
              onChangeText={setMfaCode}
              placeholder="000000"
              placeholderTextColor="#94a3b8"
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.loginBtn, (loading || mfaCode.length < 6) && styles.loginBtnDisabled]}
              onPress={handleMfaVerify}
              disabled={loading || mfaCode.length < 6}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.loginBtnText}>Doğrula</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { setMfaRequired(false); setMfaCode(''); }}
              style={styles.backLink}
            >
              <Text style={styles.backLinkText}>← Geri Dön</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.version}>v1.0.0 · ISO/IEC 17020 Uyumlu</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#0f172a' },
  scroll:         { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoContainer:  { alignItems: 'center', marginBottom: 40 },
  logoBox:        { width: 72, height: 72, borderRadius: 20, backgroundColor: '#3366f5', justifyContent: 'center', alignItems: 'center', marginBottom: 16, shadowColor: '#3366f5', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 12 },
  appName:        { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  appSub:         { fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 4 },
  formCard:       { backgroundColor: '#fff', borderRadius: 20, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.2, shadowRadius: 40, elevation: 20 },
  formTitle:      { fontSize: 20, fontWeight: '800', color: '#0f172a', marginBottom: 24, textAlign: 'center' },
  inputGroup:     { marginBottom: 16 },
  label:          { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6 },
  inputWrapper:   { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, backgroundColor: '#f8fafc', paddingHorizontal: 12 },
  inputIcon:      { marginRight: 8 },
  input:          { flex: 1, height: 48, fontSize: 15, color: '#0f172a' },
  eyeBtn:         { padding: 4 },
  loginBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#3366f5', borderRadius: 12, height: 52, marginTop: 8, shadowColor: '#3366f5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  loginBtnDisabled: { opacity: 0.6, shadowOpacity: 0 },
  loginBtnText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  offlineNote:    { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 16 },
  offlineNoteText:{ fontSize: 12, color: '#94a3b8' },
  mfaHeader:      { alignItems: 'center', marginBottom: 24 },
  mfaDesc:        { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 8 },
  mfaInput:       { textAlign: 'center', fontSize: 28, fontWeight: '700', letterSpacing: 12, height: 64, borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, marginBottom: 16 },
  backLink:       { alignItems: 'center', marginTop: 16 },
  backLinkText:   { color: '#3366f5', fontWeight: '600', fontSize: 14 },
  version:        { color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center', marginTop: 32 },
});
