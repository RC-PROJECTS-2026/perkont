import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Alert, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getEquipmentByQr, getDb } from '../lib/offline-db';
import { SyncEngine } from '../lib/sync-engine';
import { getAuthToken } from '../lib/sync-engine';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export default function QrScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned || loading) return;
    setScanned(true);
    setLoading(true);

    try {
      let qrCode = data;

      // JSON formatında QR ise parse et
      try {
        const parsed = JSON.parse(data);
        qrCode = parsed.qrCode || parsed.inventoryCode || data;
      } catch {
        // Düz metin QR kodu
      }

      // Önce local cache'de ara
      let equipment = await getEquipmentByQr(qrCode);

      // Bulunamazsa API'den çek
      if (!equipment) {
        const online = await SyncEngine.getInstance().isOnline();
        if (online) {
          const token = await getAuthToken();
          const res = await axios.get(`${API_URL}/equipment/by-qr/${encodeURIComponent(qrCode)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          equipment = res.data?.data;
        }
      }

      if (!equipment) {
        Alert.alert(
          'Ekipman Bulunamadı',
          `QR kodu "${qrCode}" sistemde kayıtlı değil.`,
          [{ text: 'Tamam', onPress: () => setScanned(false) }],
        );
        return;
      }

      // Ekipman bulundu — bu ekipman için aktif iş emri var mı?
      const db = getDb();
      const activeInspection = await db.getFirstAsync(
        `SELECT * FROM inspections WHERE equipment_id = ? AND status IN ('draft', 'in_progress')`,
        [equipment.id],
      ) as any;

      if (activeInspection) {
        Alert.alert(
          'Devam Eden Denetim',
          `Bu ekipman için devam eden bir denetim bulundu. Devam etmek ister misiniz?`,
          [
            {
              text: 'Devam Et',
              onPress: () => router.push({
                pathname: '/inspection-form',
                params: {
                  inspectionId: activeInspection.id,
                  equipmentId: equipment.id,
                  formTemplateId: activeInspection.form_template_id,
                },
              }),
            },
            { text: 'İptal', onPress: () => setScanned(false), style: 'cancel' },
          ],
        );
      } else {
        Alert.alert(
          'Ekipman Bulundu',
          `${equipment.inventory_code || equipment.inventoryCode}\n${equipment.equipment_type_name || ''}\n${equipment.customer_name || ''}`,
          [
            {
              text: 'Denetim Başlat',
              onPress: () => router.push({
                pathname: '/equipment-select',
                params: { equipmentId: equipment.id },
              }),
            },
            {
              text: 'Ekipman Detayı',
              onPress: () => Alert.alert('Bilgi', JSON.stringify(equipment, null, 2)),
            },
            { text: 'İptal', onPress: () => setScanned(false), style: 'cancel' },
          ],
        );
      }
    } catch (err: any) {
      Alert.alert('Hata', err.message || 'QR kodu işlenirken hata oluştu');
      setScanned(false);
    } finally {
      setLoading(false);
    }
  };

  if (!permission) return <View />;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionCard}>
          <Ionicons name="camera-outline" size={48} color="#3366f5" />
          <Text style={styles.permTitle}>Kamera İzni Gerekli</Text>
          <Text style={styles.permDesc}>QR kod okutmak için kamera erişimine izin vermeniz gerekmektedir.</Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>İzin Ver</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
            <Text style={{ color: '#64748b', fontSize: 14 }}>Geri Dön</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.scanTitle}>QR Kod Okut</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Scan frame */}
        <View style={styles.frameContainer}>
          <View style={styles.frame}>
            {/* Corner decorations */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            )}
          </View>
          <Text style={styles.scanHint}>
            Ekipman üzerindeki QR etiketi kameranın önüne tutun
          </Text>
        </View>

        {/* Bottom */}
        {scanned && !loading && (
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={styles.rescanBtn}
              onPress={() => setScanned(false)}
            >
              <Ionicons name="refresh-outline" size={18} color="#fff" />
              <Text style={styles.rescanText}>Tekrar Okut</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const FRAME_SIZE = 260;

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#000' },
  permissionCard:{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#f8fafc' },
  permTitle:     { fontSize: 18, fontWeight: '700', color: '#1e293b', marginTop: 16, marginBottom: 8 },
  permDesc:      { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 22 },
  permBtn:       { backgroundColor: '#3366f5', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10, marginTop: 20 },
  permBtnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },
  overlay:       { flex: 1, justifyContent: 'space-between' },
  topBar:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 52, paddingBottom: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
  closeBtn:      { padding: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)' },
  scanTitle:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  frameContainer:{ flex: 1, justifyContent: 'center', alignItems: 'center' },
  frame:         { width: FRAME_SIZE, height: FRAME_SIZE, justifyContent: 'center', alignItems: 'center' },
  corner:        { position: 'absolute', width: 28, height: 28, borderColor: '#3366f5', borderWidth: 3 },
  cornerTL:      { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 4 },
  cornerTR:      { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 4 },
  cornerBL:      { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 4 },
  cornerBR:      { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 4 },
  loadingOverlay:{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', borderRadius: 4 },
  scanHint:      { color: 'rgba(255,255,255,0.75)', fontSize: 13, textAlign: 'center', marginTop: 24, paddingHorizontal: 32 },
  bottomBar:     { backgroundColor: 'rgba(0,0,0,0.5)', padding: 24, alignItems: 'center' },
  rescanBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#3366f5', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  rescanText:    { color: '#fff', fontWeight: '700', fontSize: 15 },
});
