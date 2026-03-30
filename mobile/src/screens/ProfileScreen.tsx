import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { SyncEngine } from '../lib/sync-engine';
import { getAuthToken } from '../lib/sync-engine';
import axios from 'axios';
import { format, differenceInDays } from 'date-fns';
import { tr } from 'date-fns/locale';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export default function ProfileScreen() {
  const [user, setUser]         = useState<any>(null);
  const [certs, setCerts]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Kullanıcı bilgisi
      const userData = await SecureStore.getItemAsync('user_data');
      if (userData) setUser(JSON.parse(userData));

      // Online ise güncel sertifika bilgilerini çek
      const online = await SyncEngine.getInstance().isOnline();
      setIsOnline(online);

      if (online) {
        const token = await getAuthToken();
        const parsedUser = userData ? JSON.parse(userData) : null;
        if (parsedUser?.id && token) {
          const res = await axios.get(`${API_URL}/users/${parsedUser.id}/qualifications`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          setCerts(res.data?.data || []);
        }
      }
    } catch (err) {
      console.error('Profile load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Çıkış Yap',
      'Çıkış yapmak istediğinizden emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Çıkış Yap',
          style: 'destructive',
          onPress: async () => {
            // Token temizle
            try {
              const token = await getAuthToken();
              if (token) {
                await axios.post(`${API_URL}/auth/logout`, {}, {
                  headers: { Authorization: `Bearer ${token}` },
                }).catch(() => {});
              }
            } finally {
              await SecureStore.deleteItemAsync('access_token');
              await SecureStore.deleteItemAsync('refresh_token');
              await SecureStore.deleteItemAsync('user_data');
              router.replace('/login');
            }
          },
        },
      ],
    );
  };

  const certStatusColor = (cert: any) => {
    if (!cert.expiryDate) return '#94a3b8';
    const days = differenceInDays(new Date(cert.expiryDate), new Date());
    if (days < 0) return '#ef4444';
    if (days <= 30) return '#f59e0b';
    return '#10b981';
  };

  const certDaysText = (cert: any) => {
    if (!cert.expiryDate) return '';
    const days = differenceInDays(new Date(cert.expiryDate), new Date());
    if (days < 0) return `${Math.abs(days)} gün geçmiş`;
    if (days === 0) return 'Bugün doluyor';
    return `${days} gün kaldı`;
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3366f5" />
      </View>
    );
  }

  const roleLabels: Record<string, string> = {
    admin: 'Sistem Yöneticisi', sales: 'Satış',
    planner: 'Planlamacı', inspector: 'Muayene Elemanı',
    technical_manager: 'Teknik Yönetici', finance: 'Finans',
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profilim</Text>
        <TouchableOpacity onPress={() => router.push('/sync-status')} style={styles.syncBtn}>
          <Ionicons name="sync-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.fullName?.charAt(0)?.toUpperCase() || '?'}
            </Text>
          </View>
          <Text style={styles.fullName}>{user?.fullName}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{roleLabels[user?.role] || user?.role}</Text>
          </View>
          {user?.ekipnetNumber && (
            <View style={styles.ekipnetRow}>
              <Ionicons name="id-card-outline" size={14} color="#94a3b8" />
              <Text style={styles.ekipnetText}>EKİPNET: {user.ekipnetNumber}</Text>
            </View>
          )}

          <View style={[styles.onlineIndicator, { backgroundColor: isOnline ? '#d1fae5' : '#fef3c7' }]}>
            <View style={[styles.onlineDot, { backgroundColor: isOnline ? '#10b981' : '#f59e0b' }]} />
            <Text style={[styles.onlineText, { color: isOnline ? '#047857' : '#92400e' }]}>
              {isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
            </Text>
          </View>
        </View>

        {/* Certificates */}
        {certs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sertifikalarım</Text>
            {certs.map((cert) => {
              const color = certStatusColor(cert);
              const daysText = certDaysText(cert);
              return (
                <View key={cert.id} style={[styles.certCard, { borderLeftColor: color }]}>
                  <View style={styles.certHeader}>
                    <Text style={styles.certName}>{cert.certificateName}</Text>
                    <View style={[styles.certBadge, { backgroundColor: color + '20' }]}>
                      <Text style={[styles.certBadgeText, { color }]}>{daysText}</Text>
                    </View>
                  </View>
                  <View style={styles.certDetails}>
                    {cert.certificateNo && (
                      <Text style={styles.certDetail}>No: {cert.certificateNo}</Text>
                    )}
                    {cert.issuer && (
                      <Text style={styles.certDetail}>Veren: {cert.issuer}</Text>
                    )}
                    {cert.expiryDate && (
                      <Text style={[styles.certDetail, { color }]}>
                        Son Geçerlilik: {format(new Date(cert.expiryDate), 'd MMMM yyyy', { locale: tr })}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* App info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Uygulama</Text>
          <View style={styles.infoCard}>
            {[
              { label: 'Versiyon', value: '1.0.0' },
              { label: 'ISO/IEC 17020:2012', value: 'Uyumlu' },
              { label: 'Offline Depolama', value: 'SQLite (Şifreli)' },
              { label: 'Sync Modu', value: 'Background + Manuel' },
            ].map((row) => (
              <View key={row.label} style={styles.infoRow}>
                <Text style={styles.infoLabel}>{row.label}</Text>
                <Text style={styles.infoValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push('/sync-status')}
          >
            <Ionicons name="sync-outline" size={20} color="#3366f5" />
            <Text style={styles.actionBtnText}>Senkronizasyon Durumu</Text>
            <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBtn, styles.logoutBtn]} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#ef4444" />
            <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>Çıkış Yap</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#f8fafc' },
  center:         { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:         { backgroundColor: '#141c5a', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, paddingTop: 52, gap: 12 },
  backBtn:        { padding: 4 },
  headerTitle:    { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700' },
  syncBtn:        { padding: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8 },
  content:        { flex: 1 },
  profileCard:    { backgroundColor: '#fff', margin: 16, borderRadius: 16, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  avatar:         { width: 72, height: 72, borderRadius: 36, backgroundColor: '#3366f5', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText:     { color: '#fff', fontSize: 28, fontWeight: '800' },
  fullName:       { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  email:          { fontSize: 13, color: '#64748b', marginBottom: 10 },
  roleBadge:      { backgroundColor: '#eff6ff', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginBottom: 8 },
  roleText:       { fontSize: 12, fontWeight: '600', color: '#3366f5' },
  ekipnetRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  ekipnetText:    { fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' },
  onlineIndicator:{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  onlineDot:      { width: 6, height: 6, borderRadius: 3 },
  onlineText:     { fontSize: 12, fontWeight: '600' },
  section:        { marginHorizontal: 16, marginBottom: 16 },
  sectionTitle:   { fontSize: 12, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 },
  certCard:       { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderLeftWidth: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  certHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  certName:       { fontSize: 14, fontWeight: '700', color: '#1e293b', flex: 1, marginRight: 8 },
  certBadge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  certBadgeText:  { fontSize: 11, fontWeight: '700' },
  certDetails:    { gap: 3 },
  certDetail:     { fontSize: 12, color: '#64748b' },
  infoCard:       { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  infoRow:        { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  infoLabel:      { fontSize: 13, color: '#475569' },
  infoValue:      { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  actions:        { marginHorizontal: 16, gap: 8, marginBottom: 8 },
  actionBtn:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  actionBtnText:  { flex: 1, fontSize: 14, fontWeight: '600', color: '#1e293b' },
  logoutBtn:      { borderWidth: 1, borderColor: '#fee2e2', backgroundColor: '#fff9f9' },
});
