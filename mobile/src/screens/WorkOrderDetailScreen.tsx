import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { getDb } from '../lib/offline-db';
import { SyncEngine } from '../lib/sync-engine';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import axios from 'axios';
import { getAuthToken } from '../lib/sync-engine';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export default function WorkOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [workOrder, setWorkOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [inspections, setInspections] = useState<Record<string, any>>({});

  useEffect(() => {
    loadWorkOrder();
  }, [id]);

  const loadWorkOrder = async () => {
    setLoading(true);
    try {
      // Önce local DB'den yükle
      const db = getDb();
      const localWo = await db.getFirstAsync(
        `SELECT * FROM work_orders WHERE id = ?`, [id],
      ) as any;

      if (localWo) {
        setWorkOrder({
          ...localWo,
          equipmentItems: JSON.parse(localWo.equipment_items || '[]'),
        });

        // Mevcut denetimleri de yükle
        const existingInspections = await db.getAllAsync(
          `SELECT * FROM inspections WHERE work_order_id = ?`, [id],
        );
        const insMap: Record<string, any> = {};
        (existingInspections as any[]).forEach((ins) => {
          if (ins.equipment_id) insMap[ins.equipment_id] = ins;
        });
        setInspections(insMap);
      } else {
        // Online'dan çek
        const online = await SyncEngine.getInstance().isOnline();
        if (online) {
          const token = await getAuthToken();
          const res = await axios.get(`${API_URL}/work-orders/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          setWorkOrder(res.data?.data);
        }
      }
    } catch (err: any) {
      Alert.alert('Hata', err.message);
    } finally {
      setLoading(false);
    }
  };

  const startInspection = (equipmentItem: any) => {
    if (!equipmentItem.formTemplateId) {
      Alert.alert('Form Şablonu Eksik', 'Bu ekipman için atanmış bir form şablonu bulunamadı.');
      return;
    }

    router.push({
      pathname: '/inspection-form',
      params: {
        workOrderId: id,
        equipmentId: equipmentItem.equipmentId || equipmentItem.equipment_id,
        formTemplateId: equipmentItem.formTemplateId || equipmentItem.form_template_id,
      },
    });
  };

  const resumeInspection = (inspection: any) => {
    router.push({
      pathname: '/inspection-form',
      params: {
        inspectionId: inspection.id,
        equipmentId: inspection.equipment_id,
        formTemplateId: inspection.form_template_id,
        workOrderId: id,
      },
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3366f5" />
      </View>
    );
  }

  if (!workOrder) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>İş emri bulunamadı</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Geri Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const equipItems = workOrder.equipmentItems || [];
  const completedCount = Object.values(inspections).filter(
    (i: any) => i.status === 'completed' || i.status === 'submitted',
  ).length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{workOrder.work_order_number || workOrder.workOrderNumber}</Text>
          <Text style={styles.headerSub}>{workOrder.customer_name || workOrder.customer?.name}</Text>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {/* Info card */}
        <View style={styles.infoCard}>
          {workOrder.location_name && (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={16} color="#64748b" />
              <Text style={styles.infoText}>{workOrder.location_name}</Text>
            </View>
          )}
          {(workOrder.planned_date || workOrder.plannedDate) && (
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={16} color="#64748b" />
              <Text style={styles.infoText}>
                {format(
                  new Date(workOrder.planned_date || workOrder.plannedDate),
                  'd MMMM yyyy', { locale: tr },
                )}
              </Text>
            </View>
          )}
          {workOrder.notes && (
            <View style={[styles.infoRow, { alignItems: 'flex-start' }]}>
              <Ionicons name="document-text-outline" size={16} color="#64748b" style={{ marginTop: 2 }} />
              <Text style={[styles.infoText, { flex: 1 }]}>{workOrder.notes}</Text>
            </View>
          )}
        </View>

        {/* Progress */}
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>Denetim İlerlemesi</Text>
            <Text style={styles.progressCount}>{completedCount} / {equipItems.length}</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[
              styles.progressFill,
              { width: equipItems.length > 0 ? `${(completedCount / equipItems.length) * 100}%` : '0%' },
            ]} />
          </View>
        </View>

        {/* Equipment list */}
        <Text style={styles.sectionTitle}>Ekipmanlar ({equipItems.length})</Text>

        {equipItems.map((item: any, idx: number) => {
          const eqId = item.equipmentId || item.equipment_id;
          const existingInsp = inspections[eqId];
          const isCompleted = existingInsp?.status === 'completed' || existingInsp?.status === 'submitted';
          const isInProgress = existingInsp?.status === 'in_progress' || existingInsp?.status === 'draft';

          return (
            <View key={idx} style={styles.equipCard}>
              <View style={styles.equipHeader}>
                <View style={styles.equipIcon}>
                  <Ionicons name="construct-outline" size={18} color="#3366f5" />
                </View>
                <View style={styles.equipInfo}>
                  <Text style={styles.equipCode}>
                    {item.equipment?.inventoryCode || item.inventoryCode || eqId?.slice(0, 8)}
                  </Text>
                  <Text style={styles.equipType}>
                    {item.equipment?.equipmentType?.name || item.equipmentType || 'Ekipman'}
                  </Text>
                </View>
                <View style={[
                  styles.equipStatus,
                  isCompleted && styles.statusCompleted,
                  isInProgress && styles.statusInProgress,
                ]}>
                  <Text style={[
                    styles.equipStatusText,
                    isCompleted && { color: '#047857' },
                    isInProgress && { color: '#d97706' },
                  ]}>
                    {isCompleted ? 'Tamamlandı' : isInProgress ? 'Devam' : 'Bekliyor'}
                  </Text>
                </View>
              </View>

              {(item.equipment?.brand || item.brand) && (
                <Text style={styles.equipDetail}>
                  {item.equipment?.brand || item.brand}
                  {(item.equipment?.capacity || item.capacity) && ` · ${item.equipment?.capacity || item.capacity}`}
                </Text>
              )}

              <TouchableOpacity
                style={[
                  styles.startBtn,
                  isCompleted && styles.startBtnDisabled,
                ]}
                onPress={() => {
                  if (isInProgress && existingInsp) {
                    resumeInspection(existingInsp);
                  } else if (!isCompleted) {
                    startInspection(item);
                  }
                }}
                disabled={isCompleted}
              >
                <Ionicons
                  name={isCompleted ? 'checkmark-circle' : isInProgress ? 'play-circle' : 'clipboard-outline'}
                  size={18}
                  color={isCompleted ? '#10b981' : '#fff'}
                />
                <Text style={[styles.startBtnText, isCompleted && { color: '#10b981' }]}>
                  {isCompleted ? 'Tamamlandı' : isInProgress ? 'Devam Et' : 'Denetimi Başlat'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#f8fafc' },
  center:        { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText:     { color: '#ef4444', fontSize: 16, marginBottom: 16 },
  backBtn:       { backgroundColor: '#3366f5', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  backBtnText:   { color: '#fff', fontWeight: '600' },
  header:        { backgroundColor: '#141c5a', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, paddingTop: 52, gap: 12 },
  backButton:    { padding: 4 },
  headerInfo:    { flex: 1 },
  headerTitle:   { color: '#fff', fontSize: 16, fontWeight: '800', fontFamily: 'monospace' },
  headerSub:     { color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 2 },
  content:       { flex: 1 },
  infoCard:      { backgroundColor: '#fff', margin: 16, marginBottom: 8, borderRadius: 14, padding: 16, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  infoRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText:      { fontSize: 14, color: '#475569' },
  progressCard:  { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 8, borderRadius: 14, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  progressHeader:{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  progressTitle: { fontSize: 14, fontWeight: '600', color: '#334155' },
  progressCount: { fontSize: 14, fontWeight: '700', color: '#3366f5' },
  progressBar:   { height: 6, backgroundColor: '#e2e8f0', borderRadius: 3 },
  progressFill:  { height: 6, backgroundColor: '#3366f5', borderRadius: 3 },
  sectionTitle:  { fontSize: 13, fontWeight: '700', color: '#64748b', marginHorizontal: 16, marginTop: 8, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  equipCard:     { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10, borderRadius: 14, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  equipHeader:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  equipIcon:     { w: 36, h: 36, backgroundColor: '#eff6ff', borderRadius: 10, padding: 8 },
  equipInfo:     { flex: 1 },
  equipCode:     { fontSize: 14, fontWeight: '700', color: '#1e293b', fontFamily: 'monospace' },
  equipType:     { fontSize: 12, color: '#64748b', marginTop: 2 },
  equipDetail:   { fontSize: 13, color: '#64748b', marginBottom: 12 },
  equipStatus:   { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#f1f5f9', borderRadius: 20 },
  statusCompleted:  { backgroundColor: '#d1fae5' },
  statusInProgress: { backgroundColor: '#fef3c7' },
  equipStatusText:  { fontSize: 11, fontWeight: '600', color: '#64748b' },
  startBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#3366f5', borderRadius: 10, paddingVertical: 12, marginTop: 4 },
  startBtnDisabled: { backgroundColor: '#f1f5f9' },
  startBtnText:     { color: '#fff', fontWeight: '700', fontSize: 14 },
});
