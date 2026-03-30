import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getDb } from '../lib/offline-db';
import { SyncEngine } from '../lib/sync-engine';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';

interface SyncRecord {
  id: string;
  type: string;
  status: string;
  localId: string;
  serverId: string | null;
  createdAt: string;
  attemptCount: number;
}

export default function SyncStatusScreen() {
  const [records, setRecords]     = useState<SyncRecord[]>([]);
  const [summary, setSummary]     = useState({ synced: 0, pending: 0, failed: 0, photos: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing]     = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const db = getDb();

    // Denetimler
    const inspections = await db.getAllAsync(
      `SELECT id, status, sync_status, local_uuid, server_id, created_at FROM inspections ORDER BY created_at DESC LIMIT 50`,
    ) as any[];

    // Fotoğraflar
    const photos = await db.getAllAsync(
      `SELECT COUNT(*) as count FROM inspection_photos WHERE sync_status = 'pending'`,
    ) as any[];

    const synced  = inspections.filter(i => i.sync_status === 'synced').length;
    const pending = inspections.filter(i => i.sync_status === 'pending').length;
    const failed  = inspections.filter(i => i.sync_status === 'failed').length;

    setSummary({
      synced,
      pending,
      failed,
      photos: photos[0]?.count || 0,
    });

    setRecords(inspections.map(i => ({
      id: i.id,
      type: 'inspection',
      status: i.sync_status,
      localId: i.local_uuid || i.id,
      serverId: i.server_id,
      createdAt: i.created_at,
      attemptCount: 0,
    })));
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await SyncEngine.getInstance().sync();
      Alert.alert(
        'Senkronizasyon Tamamlandı',
        `✅ ${result.success} kayıt senkronize edildi\n` +
        (result.failed > 0 ? `❌ ${result.failed} hata\n` : '') +
        (result.conflicts.length > 0 ? `⚠️ ${result.conflicts.length} çakışma` : ''),
      );
      await loadData();
    } catch (err: any) {
      Alert.alert('Hata', err.message);
    } finally {
      setSyncing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'synced':   return { name: 'checkmark-circle', color: '#10b981' };
      case 'pending':  return { name: 'time', color: '#f59e0b' };
      case 'failed':   return { name: 'close-circle', color: '#ef4444' };
      case 'conflict': return { name: 'warning', color: '#8b5cf6' };
      default:         return { name: 'help-circle', color: '#94a3b8' };
    }
  };

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      synced: 'Senkronize', pending: 'Bekliyor',
      failed: 'Hatalı', conflict: 'Çakışma',
    };
    return labels[status] || status;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Senkronizasyon Durumu</Text>
        <TouchableOpacity
          onPress={handleSync}
          disabled={syncing}
          style={[styles.syncBtn, syncing && styles.syncBtnDisabled]}
        >
          {syncing
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
          }
        </TouchableOpacity>
      </View>

      {/* Summary cards */}
      <View style={styles.summaryRow}>
        {[
          { label: 'Senkronize',  count: summary.synced,  color: '#10b981', icon: 'checkmark-circle' },
          { label: 'Bekleyen',    count: summary.pending, color: '#f59e0b', icon: 'time' },
          { label: 'Hatalı',      count: summary.failed,  color: '#ef4444', icon: 'close-circle' },
          { label: 'Bekl. Fotoğ.', count: summary.photos, color: '#8b5cf6', icon: 'images' },
        ].map((item) => (
          <View key={item.label} style={styles.summaryCard}>
            <Ionicons name={item.icon as any} size={20} color={item.color} />
            <Text style={[styles.summaryCount, { color: item.color }]}>{item.count}</Text>
            <Text style={styles.summaryLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* Record list */}
      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3366f5" />}
        ListHeaderComponent={
          <Text style={styles.listHeader}>Son 50 Kayıt</Text>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="cloud-done-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyText}>Kayıt bulunamadı</Text>
          </View>
        }
        renderItem={({ item }) => {
          const icon = statusIcon(item.status);
          const timeAgo = item.createdAt
            ? formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: tr })
            : '';
          return (
            <View style={styles.record}>
              <Ionicons name={icon.name as any} size={20} color={icon.color} style={styles.recordIcon} />
              <View style={styles.recordInfo}>
                <Text style={styles.recordId} numberOfLines={1}>
                  {item.serverId ? `✓ ${item.serverId.slice(0, 8)}…` : item.localId?.slice(0, 16)}
                </Text>
                <Text style={styles.recordMeta}>
                  {item.type} · {timeAgo}
                </Text>
              </View>
              <View style={[styles.recordBadge, { backgroundColor: icon.color + '20' }]}>
                <Text style={[styles.recordBadgeText, { color: icon.color }]}>
                  {statusLabel(item.status)}
                </Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#f8fafc' },
  header:         { backgroundColor: '#141c5a', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, paddingTop: 52, gap: 12 },
  backBtn:        { padding: 4 },
  headerTitle:    { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700' },
  syncBtn:        { padding: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8 },
  syncBtnDisabled:{ opacity: 0.5 },
  summaryRow:     { flexDirection: 'row', padding: 16, gap: 8 },
  summaryCard:    { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 10, alignItems: 'center', gap: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  summaryCount:   { fontSize: 20, fontWeight: '800' },
  summaryLabel:   { fontSize: 9, color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', textAlign: 'center' },
  list:           { padding: 16, gap: 8 },
  listHeader:     { fontSize: 12, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 },
  emptyState:     { alignItems: 'center', paddingVertical: 48 },
  emptyText:      { color: '#94a3b8', fontSize: 14, marginTop: 12 },
  record:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  recordIcon:     { flexShrink: 0 },
  recordInfo:     { flex: 1 },
  recordId:       { fontSize: 13, fontWeight: '600', color: '#1e293b', fontFamily: 'monospace' },
  recordMeta:     { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  recordBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  recordBadgeText:{ fontSize: 11, fontWeight: '700' },
});
