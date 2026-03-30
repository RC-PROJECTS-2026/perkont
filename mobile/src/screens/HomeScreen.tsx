import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl, Alert, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getMyWorkOrders } from '../lib/offline-db';
import { SyncEngine, SyncStatus } from '../lib/sync-engine';
import { initDatabase } from '../lib/offline-db';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

export default function HomeScreen() {
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ status: 'idle' });
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    bootstrap();
    const unsubscribe = SyncEngine.getInstance().onSyncStatusChange(setSyncStatus);
    return unsubscribe;
  }, []);

  const bootstrap = async () => {
    try {
      await initDatabase();
      setDbReady(true);
      const online = await SyncEngine.getInstance().isOnline();
      setIsOnline(online);

      if (online) {
        await SyncEngine.getInstance().pullWorkOrders();
      }

      await loadWorkOrders();
    } catch (err: any) {
      Alert.alert('Başlatma Hatası', err.message);
    }
  };

  const loadWorkOrders = async () => {
    const orders = await getMyWorkOrders();
    setWorkOrders(orders);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const online = await SyncEngine.getInstance().isOnline();
      setIsOnline(online);

      if (online) {
        await SyncEngine.getInstance().sync();
        await SyncEngine.getInstance().pullWorkOrders();
      }
      await loadWorkOrders();
    } finally {
      setRefreshing(false);
    }
  };

  const statusColors = {
    draft:       '#94a3b8',
    planned:     '#3b82f6',
    assigned:    '#8b5cf6',
    in_progress: '#f59e0b',
    completed:   '#10b981',
  };

  const statusLabels: Record<string, string> = {
    draft: 'Taslak', planned: 'Planlandı',
    assigned: 'Atandı', in_progress: 'Devam Ediyor',
    completed: 'Tamamlandı',
  };

  const renderWorkOrder = ({ item }: { item: any }) => {
    const date = item.planned_date
      ? format(new Date(item.planned_date), 'd MMMM yyyy', { locale: tr })
      : null;
    const equipCount = item.equipmentItems?.length || 0;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push({ pathname: '/work-order/[id]', params: { id: item.id } })}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.statusDot, { backgroundColor: statusColors[item.status as keyof typeof statusColors] || '#94a3b8' }]} />
          <Text style={styles.woNumber}>{item.work_order_number || item.id?.slice(0, 8)}</Text>
          <View style={styles.spacer} />
          <Text style={[styles.statusBadge, { color: statusColors[item.status as keyof typeof statusColors] || '#94a3b8' }]}>
            {statusLabels[item.status] || item.status}
          </Text>
        </View>

        <Text style={styles.customerName}>{item.customer_name || '—'}</Text>
        {item.location_name && (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={12} color="#94a3b8" />
            <Text style={styles.locationText}>{item.location_name}</Text>
          </View>
        )}

        <View style={styles.cardFooter}>
          <View style={styles.footerItem}>
            <Ionicons name="construct-outline" size={14} color="#94a3b8" />
            <Text style={styles.footerText}>{equipCount} ekipman</Text>
          </View>
          {date && (
            <View style={styles.footerItem}>
              <Ionicons name="calendar-outline" size={14} color="#94a3b8" />
              <Text style={styles.footerText}>{date}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={16} color="#cbd5e1" style={{ marginLeft: 'auto' }} />
        </View>
      </TouchableOpacity>
    );
  };

  const syncColor = {
    idle:    '#94a3b8',
    syncing: '#3b82f6',
    success: '#10b981',
    error:   '#ef4444',
  }[syncStatus.status];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#141c5a" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>PerKont</Text>
          <Text style={styles.headerSub}>Saha Denetim Uygulaması</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => router.push('/scan')}
            style={styles.headerBtn}
          >
            <Ionicons name="qr-code-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => SyncEngine.getInstance().sync().then(loadWorkOrders)}
            style={styles.headerBtn}
          >
            <Ionicons
              name={syncStatus.status === 'syncing' ? 'sync' : 'cloud-upload-outline'}
              size={22}
              color={syncColor}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sync banner */}
      {syncStatus.status !== 'idle' && (
        <View style={[styles.syncBanner, { backgroundColor: syncColor + '20', borderColor: syncColor + '40' }]}>
          <View style={[styles.syncDot, { backgroundColor: syncColor }]} />
          <Text style={[styles.syncText, { color: syncColor }]}>
            {syncStatus.message || syncStatus.status}
          </Text>
        </View>
      )}

      {/* Online/Offline banner */}
      {isOnline === false && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color="#d97706" />
          <Text style={styles.offlineText}>Çevrimdışı mod — denetim yapabilirsiniz</Text>
        </View>
      )}

      {/* Work order list */}
      <FlatList
        data={workOrders}
        renderItem={renderWorkOrder}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#3366f5"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="clipboard-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>İş emri bulunamadı</Text>
            <Text style={styles.emptyDesc}>Size atanmış iş emri yok. Yukarıdan yenileyebilirsiniz.</Text>
          </View>
        }
        ListHeaderComponent={
          workOrders.length > 0 ? (
            <Text style={styles.listHeader}>
              {workOrders.length} iş emri atanmış
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { backgroundColor: '#141c5a', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, paddingTop: 52 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  headerSub: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 4 },
  headerBtn: { padding: 8, borderRadius: 8 },
  syncBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  syncDot: { width: 6, height: 6, borderRadius: 3 },
  syncText: { fontSize: 13, fontWeight: '500' },
  offlineBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef3c7', marginHorizontal: 16, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  offlineText: { fontSize: 13, color: '#92400e', fontWeight: '500' },
  list: { padding: 16, gap: 12 },
  listHeader: { fontSize: 13, color: '#94a3b8', fontWeight: '600', marginBottom: 4 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  woNumber: { fontSize: 13, fontWeight: '700', color: '#1e293b', fontFamily: 'monospace' },
  spacer: { flex: 1 },
  statusBadge: { fontSize: 12, fontWeight: '600' },
  customerName: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  locationText: { fontSize: 12, color: '#94a3b8' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12 },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerText: { fontSize: 12, color: '#94a3b8', fontWeight: '500' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#475569', marginTop: 16, marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },
});
